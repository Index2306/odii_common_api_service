const _ = require('lodash')
const { getOrder } = require('../models/order')
const {
    getPartnerAffiliate,
    countAffByPartnerId,
    updatePartnerAffiliate,
} = require('../models/partner-affiliate')
const { useMyTrx } = require('../connections/pg-general')
const affiliatePayout = require('../models/affiliate_payout')
const Bank = require('../models/bank')
const { knex } = require('../connections/pg-general')
const {
    getCurrPayoutAffiliate,
    getPayoutAffiliateTimeRange,
} = require('./partner-affiliate.service')
const {
    adminApproveSellerAffiliateCommision,
    sendConfirmAffiliteTransactionNotification,
} = require('./transaction.service')

exports.insertAffiliatePayout = async (orderId, tenantId, inputTrx = undefined) => {
    const order = await getOrder({ id: orderId })
    const partner_order_id = order.partner_id
    const partnerAffiliate = await getPartnerAffiliate({
        // người được giới thiệu
        partner_id: partner_order_id,
    })
    const affiliateId = partnerAffiliate?.partner_affiliate_id

    const isValid = affiliateId && partnerAffiliate.status === 'active'
    // && partnerAffiliate.partner_affiliate_expiry_date &&
    // !moment(partnerAffiliate.partner_affiliate_expiry_date).isBefore(
    //     moment()
    // )

    if (!isValid) {
        return
    }
    const affiliate = await getPartnerAffiliate({
        // người đã giới thiệu
        partner_id: affiliateId,
    })

    if (!affiliate) {
        return
    }

    // const isFirstOrder = affiliate.total_order === 0
    const affiliate_commission_percent = affiliate.first_order_percent

    let commission = order.total_price * affiliate_commission_percent * 0.01
    if (commission <= 0) return
    await useMyTrx(inputTrx, async (trx) => {
        await updatePartnerAffiliate(
            { partner_id: affiliateId },
            { total_order: affiliate.total_order + 1 },
            { trx }
        )
        // const [affiliatePayoutId] =
        await affiliatePayout.insertAffiliatePayout(
            {
                partner_order_id,
                partner_affiliate_id: affiliateId,
                commission,
                payout_affiliate_key: getCurrPayoutAffiliate().key,
                order_id: order.id,
                order_total_price: order.total_price,
                affiliate_commission_percent,
                order_created_at: order.created_at,
                metadata: {
                    partner_affiliate_created_at: partnerAffiliate.created_at,
                    // partner_affiliate_expiry_date:
                    //     partnerAffiliate.partner_affiliate_expiry_date,
                },
                tenant_id: tenantId,
            },
            { trx }
        )

        // check partner affiliate payout if have - update: insert
        const partnerAffiliatePayout =
            await affiliatePayout.getListAffiliatePayoutPeriods({
                payout_affiliate_key: getCurrPayoutAffiliate().key,
                partner_id: affiliateId,
            })

        if (partnerAffiliatePayout) {
            commission += partnerAffiliatePayout.commission
            const total_orders = partnerAffiliatePayout.total_orders + 1
            await affiliatePayout.updateAffiliatePayoutPeriod(
                {
                    payout_affiliate_key:
                        partnerAffiliatePayout.payout_affiliate_key,
                    partner_id: affiliateId,
                },
                {
                    commission,
                    total_orders,
                },
                { trx }
            )
        } else {
            const affiliatePeriod = getCurrPayoutAffiliate()
            await affiliatePayout.insertAffiliatePayoutPeriod(
                {
                    commission,
                    payout_affiliate_key: affiliatePeriod.key,
                    isPaid: false,
                    total_orders: 1,
                    partner_id: affiliateId,
                    start_date: affiliatePeriod.startDate,
                    end_date: affiliatePeriod.endDate,
                    tenant_id: tenantId,
                },
                { trx }
            )
        }

        return true
    })
}

exports.getCommissionListing = async (
    partner_affiliate_id,
    payout_affiliate_key,
    from_date,
    to_date,
    keyword,
    paginator
) => {
    const result = await affiliatePayout.getAffiliatePayouts(
        {
            partner_affiliate_id,
            // status: 'active',
        },
        async (query) => {
            payout_affiliate_key && query.andWhere({ payout_affiliate_key })
            keyword && query.andWhere('shop_order_id', 'ilike', `%${keyword}%`)
            from_date && query.andWhere('created_at', '>=', from_date)
            to_date && query.andWhere('created_at', '<=', to_date)

            return await query
                .orderBy('id', 'desc')
                .paginate(paginator.paginate)
        }
    )

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: paginator.page,
            page_size: paginator.page_size,
        },
        data: result.data,
    }
}

exports.adminGetCommissionListing = async (
    partner_id,
    isPaid,
    payout_affiliate_key,
    paginator,
    orderBy = 'affiliate_payout_period.id',
    keyword,
    tenant_id
) => {
    const result = await affiliatePayout.getAffiliatePayoutPeriods(
        {
            payout_affiliate_key,
        },
        async (query) => {
            partner_id && query.where({ partner_id })
            isPaid && query.where({ isPaid })
            keyword &&
                query.andWhere((builder) => {
                    builder.where('u.email', 'ilike', `%${keyword}%`)
                    builder.orWhere('u.full_name', 'ilike', `%${keyword}%`)
                })

            return await query
                .orderBy(orderBy, 'desc')
                .paginate(paginator.paginate)
        },
        tenant_id,
    )

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: paginator.page,
            page_size: paginator.page_size,
        },
        data: result.data,
    }
}

exports.adminGetCommissionByPeriods = async (payout_affiliate_key, tenantId) => {
    const result = await affiliatePayout.getStatsByPeriods(
        {
            payout_affiliate_key,
        },
        async (query) => await query,
        tenantId
    )

    return {
        data: result,
    }
}

exports.getCommissionByPeriods = async (options) => {
    const [statisticalAff, countAff] = await Promise.all([
        affiliatePayout.getStatsByOrders(options, async (query) => await query),
        countAffByPartnerId(options),
    ])
    const data = { ...statisticalAff, number_of_Affs: countAff.count }

    return {
        data,
    }
}

exports.adminUpdateCommission = async (userId, id, paymenStatus, note) => {
    const period = await affiliatePayout.getAffiliatePayoutPeriod({ id })
    if (!period) throw new Error('period_id_not_found')

    const bank = await Bank.getBankDetailByPartnerId(period.partner_id)

    // const userPrimaryBalance = await Balance.getPrimaryBalanceByPartner(
    //     period.partner_id
    // )
    // update status aff period and create transaction
    let transId = 0
    const isPaid = paymenStatus === 'confirmed'
    const notifyContent = `Thanh toán tiền hoa hồng ${period.payout_affiliate_key}`
    await knex.transaction(async (trx) => {
        await affiliatePayout.updateAffiliatePayoutPeriod(
            {
                id,
                payout_affiliate_key: period.payout_affiliate_key,
            },
            {
                isPaid,
                status: paymenStatus,
                note,
            },
            { trx }
        )
        await affiliatePayout.updateAffiliatePayout(
            {
                partner_affiliate_id: period.partner_id,
                payout_affiliate_key: period.payout_affiliate_key,
            },
            {
                isPaid,
                status: paymenStatus,
                note,
            },
            { trx }
        )
        if (isPaid) {
            const amount = period.commission * 1 || 0
            transId = await adminApproveSellerAffiliateCommision(
                {
                    for_partner_id: period.partner_id,
                    amount,
                    bank_id: bank.id,
                    note: notifyContent,
                    user_id: userId,
                    payout_affiliate_key: period.payout_affiliate_key,
                    tenant_id: bank.tenant_id
                },
                trx
            )
            console.log('affiliate commission result', transId)

            return true
        }

        return true
    })
    if (transId > 0) {
        await sendConfirmAffiliteTransactionNotification(
            transId,
            notifyContent,
            userId
        )
    }
}

exports.adminGetDetailCommission = async (id) => {
    const period = await affiliatePayout.getAffiliatePayoutPeriods({
        'affiliate_payout_period.id': id,
    })

    if (_.isEmpty(period)) throw new Error('period_id_not_found')
    let data = period[0]
    if (!data.start_date || data.end_date) {
        const timeRange = getPayoutAffiliateTimeRange(
            period[0].payout_affiliate_key
        )
        console.log('timerange', timeRange)
        if (timeRange?.startDate && timeRange?.endDate) {
            await affiliatePayout.updateAffiliatePayoutPeriod(
                { id: data.id },
                { start_date: timeRange.startDate, end_date: timeRange.endDate }
            )
            data = {
                ...data,
                start_date: timeRange.startDate,
                end_date: timeRange.endDate,
            }
        }
    }

    return data
}

exports.adminGetListOrders = async (
    partner_affiliate_id,
    payout_affiliate_key,
    from_date,
    to_date,
    keyword,
    paginator,
    isPaid
) => {
    const result = await affiliatePayout.getAffiliatePayouts(
        {
            // status: 'active',
        },
        async (query) => {
            payout_affiliate_key && query.andWhere({ payout_affiliate_key })
            partner_affiliate_id && query.andWhere({ partner_affiliate_id })
            keyword && query.andWhere({ partner_order_id: keyword })
            from_date && query.andWhere('created_at', '>=', from_date)
            to_date && query.andWhere('created_at', '<=', to_date)
            isPaid && query.andWhere({ isPaid })

            return await query
                .orderBy('id', 'desc')
                .paginate(paginator.paginate)
        }
    )

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: paginator.page,
            page_size: paginator.page_size,
        },
        data: result.data,
    }
}
