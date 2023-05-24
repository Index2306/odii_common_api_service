const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { getBasicUser } = require('./model-helper')

exports.insertAffiliatePayout = (data, { trx } = {}) =>
    getKnex('affiliate_payout', trx).returning('id').insert(data)

exports.updateAffiliatePayoutPeriod = (condition, data, { trx } = {}) =>
    getKnex('affiliate_payout_period', trx).update(data).where(condition)

exports.updateAffiliatePayout = (condition, data, { trx } = {}) =>
    getKnex('affiliate_payout', trx).where(condition).update(data)

exports.updateAffiliatePayoutById = (id, data, { trx } = {}) =>
    exports.updateAffiliatePayout({ id }, data, { trx })

exports.getAffiliatePayoutPeriod = (condition) =>
    knex.first().from('affiliate_payout_period').where(condition)

exports.getAffiliatePayouts = async (condition, queryBuilder) => {
    let result
    let query = knex
        .select(
            'affiliate_payout.*',
            'partner.user_id',
            'order.shop_order_id',
            'order.code'
        )
        .from('affiliate_payout')
        .leftJoin('partner', 'partner.id', 'affiliate_payout.partner_order_id')
        .leftJoin('order', 'order.id', 'affiliate_payout.order_id')
    // .where(condition)
    if (condition.status) {
        query = query.where('affiliate_payout.status', condition.status)
    }
    if (condition.partner_affiliate_id) {
        query = query.where(
            'affiliate_payout.partner_affiliate_id',
            condition.partner_affiliate_id
        )
    }
    if (!queryBuilder) {
        result = await query
    } else {
        result = await queryBuilder(query)
    }

    return result
}

exports.getAffiliatePayoutPeriods = async (condition, queryBuilder, tenant_id) => {
    let result
    let query = knex
        .select(
            'affiliate_payout_period.*',
            getBasicUser('u', 'from_user'),
            knex.raw(
                `json_build_object('id',bank.id,'sub_title', bank.sub_title,  'account_name', bank.account_name, 'account_number', bank.account_number, 'status', bank.status, 'type', bank.type , 'bank_info', json_build_object('title',bank_info.title, 'code',bank_info.code, 'logo', bank_info.logo)) as bank_data`
            )
        )
        .from('affiliate_payout_period')
        .leftJoin('partner', 'partner.id', 'affiliate_payout_period.partner_id')
        .leftJoin('user as u', 'u.id', 'partner.user_id')
        .leftJoin(
            'bank',
            'bank.partner_id',
            'affiliate_payout_period.partner_id'
        )
        .leftJoin('bank_info', 'bank_info.id', 'bank.bank_info_id')

        // .where('bank.is_default', true)
        .where(condition)
    query = query.where((builder) => {
        builder.whereNull('bank.id')
        builder.orWhere('bank.is_default', true)

        return builder
    })
    if (tenant_id)
        query.andWhere('affiliate_payout_period.tenant_id', tenant_id)
    if (!queryBuilder) {
        result = await query
    } else {
        result = await queryBuilder(query)
    }

    return result
}

exports.insertAffiliatePayoutPeriod = (data, { trx } = {}) =>
    getKnex('affiliate_payout_period', trx).returning('id').insert(data)

exports.getListAffiliatePayoutPeriods = (condition) =>
    knex.first().from('affiliate_payout_period').where(condition)

exports.updateAffiliatePayoutPeriod = (condition, data, { trx } = {}) =>
    getKnex('affiliate_payout_period', trx).update(data).where(condition)

exports.getStatsByPeriods = async (condition, queryBuilder, tenantId) => {
    let result
    let query = knex
        .select(
            knex.raw(`
                    count(id) as number_of_affs,
                    sum(case "isPaid" when false then 1 else 0 end ) as number_of_unpaid_affs,
                    sum(case "isPaid" when true then "commission" else 0 end) as total_paid_commissions,
                    sum(case "isPaid" when false then "commission" else 0 end ) as total_unpaid_commissions`)
        )
        .first()
        .from('affiliate_payout_period')
        .where(condition)
    if (tenantId)
        query.andWhere('affiliate_payout_period.tenant_id', tenantId)
    if (!queryBuilder) {
        result = await query
    } else {
        result = await queryBuilder(query)
    }

    return result
}

exports.getStatsByOrders = async (condition, queryBuilder) => {
    let result
    const query = await knex
        .select(
            knex.raw(`
                    sum("commission") as total_commissions,
                    sum("order_total_price") as order_total_price,
                    sum(case "isPaid" when false then "commission" else 0 end ) as total_unpaid_commissions`)
        )
        .first()
        .from('affiliate_payout')
        .where(condition)
    if (!queryBuilder) {
        result = await query
    } else {
        result = await queryBuilder(query)
    }

    return result
}

exports.adminGetListPartnerAff = async (
    partner_id,
    isPaid,
    payout_affiliate_key,
    paginator,
    orderBy = 'affiliate_payout_period.id'
) => {
    const result = await affiliatePayout.getAffiliatePayoutPeriods(
        {
            payout_affiliate_key,
        },
        async (query) => {
            partner_id && query.where({ partner_id })
            isPaid && query.where({ isPaid })

            return await query
                .orderBy(orderBy, 'desc')
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
