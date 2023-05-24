const { customAlphabet } = require('nanoid')
const moment = require('moment-timezone')
const { AFFILIATE_ACC_TYPES } = require('../constants')
const partnerAffiliate = require('../models/partner-affiliate')
const {
    AFFILIATE_FIRST_ORDER_PERCENT_DEFAULT,
    AFFILIATE_SECONED_ORDER_PERCENT_DEFAULT,
} = require('../config')

const AFFILIATE_CODE_REST_CHARACTERS = 'KLMNOPQRSTUVWXYZ'
const AFFILIATE_CODE_MIN_LENGTH = 8

const genAffiliateCode = customAlphabet(
    AFFILIATE_CODE_REST_CHARACTERS,
    AFFILIATE_CODE_MIN_LENGTH
)

const {
    AFFILIATE_EXPIRY_TIME_DAYS,
    AFFILIATE_PAYOUT_BEGIN_DAY,
    DEBT_TIME_ZONE,
} = require('../config')
const { getKnex } = require('../connections/pg-general')

const parseNumberToAlphaBet = (numberStr) => {
    let alphabetResult = ''
    const hexNumberStart = 65 // 65 map with character A in ASCII.
    numberStr.split('').forEach((char) => {
        const hexNumber = parseInt(char) + hexNumberStart
        alphabetResult += String.fromCharCode(hexNumber)
    })

    return alphabetResult
}

const normalizeAffiliateCode = (code) => {
    const codeLength = code.length
    // if (codeLength >= AFFILIATE_CODE_MIN_LENGTH) {
    //     return code
    // }
    const restLength = AFFILIATE_CODE_MIN_LENGTH - codeLength
    const codeBefore = genAffiliateCode().substring(0, restLength)

    return codeBefore + code
}

const insertPartnerAffiliate = async (userData, { trx } = {}) => {
    const { account_type, partner_id, partner_affiliate_code } = userData
    let affiliate // người giới thiệu

    if (!AFFILIATE_ACC_TYPES.includes(account_type)) {
        return
    }

    let own_affiliate_code = parseNumberToAlphaBet(partner_id)
    own_affiliate_code = normalizeAffiliateCode(own_affiliate_code)
    if (partner_affiliate_code) {
        affiliate = await partnerAffiliate.getPartnerAffiliateByOwnCode(
            partner_affiliate_code
        )
    }

    // const created_at = moment()
    // if (partner_affiliate_id) {
    //     partner_affiliate_expiry_date = created_at
    //         .clone()
    //         .add(AFFILIATE_EXPIRY_TIME_DAYS, 'days')
    // }

    await partnerAffiliate.insertPartnerAffiliate(
        {
            partner_id,
            own_affiliate_code,
            // created_at,
            // partner_affiliate_expiry_date,
            first_order_percent: AFFILIATE_FIRST_ORDER_PERCENT_DEFAULT,
            second_order_percent: AFFILIATE_SECONED_ORDER_PERCENT_DEFAULT,
            ...(affiliate && { partner_affiliate_id: affiliate.partner_id }),
        },
        { trx }
    )

    if (affiliate) {
        await partnerAffiliate.updatePartnerAffiliate(
            { id: affiliate.id },
            { total_partner: affiliate.total_partner + 1 },
            { trx }
        )
    }
}
exports.insertPartnerAffiliate = insertPartnerAffiliate

exports.verifyPartnerAffiliate = async (partnerId, { trx } = {}) => {
    await partnerAffiliate.updatePartnerAffiliate(
        { partner_id: partnerId },
        { is_verified: true },
        { trx }
    )
}

exports.getPartnerAffiliateByPartnerId = async (partnerId) =>
    await partnerAffiliate.getPartnerAffiliate({ partner_id: partnerId })

exports.getAffiliateOfPartner = async (
    partner_id,
    register_from,
    register_to,
    keyword,
    account_status,
    paginator
) => {
    const result = await partnerAffiliate.getPartnerAffiliates(
        {},
        async (query) => {
            query.select(
                'u.id as user_id',
                'pu.partner_id',
                'u.email',
                'u.phone',
                'u.full_name',
                'u.status',
                'u.created_at'
            )
            query.leftJoin(
                'partner_user as pu',
                'pu.partner_id',
                'partner_affiliate.partner_id'
            )
            query.leftJoin('user as u', 'u.id', 'pu.user_id')
            query.andWhere({
                'partner_affiliate.partner_affiliate_id': partner_id,
                'partner_affiliate.status': 'active',
            })
            register_from && query.andWhere('u.created_at', '>=', register_from)
            register_to && query.andWhere('u.created_at', '<=', register_to)
            account_status && query.andWhere({ 'u.status': account_status })
            keyword &&
                query.andWhere((builder) => {
                    builder.where('u.email', 'like', `%${keyword}%`)
                    builder.orWhere('u.full_name', 'like', `%${keyword}%`)
                    const partner_id = parseInt(keyword)
                    partner_id &&
                        builder.orWhere({
                            'partner_affiliate.partner_id': partner_id,
                        })
                })

            return await query
                .orderBy('partner_affiliate.id', 'desc')
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

exports.updateAffiliateForMaintain = async () => {
    const partnerAffiliates = await partnerAffiliate.getAffiliateForUpdate()
    for (const affiliater of partnerAffiliates) {
        const { id } = affiliater
        const partner_affiliate_expiry_date = moment(affiliater.created_at).add(
            AFFILIATE_EXPIRY_TIME_DAYS,
            'days'
        )
        await partnerAffiliate.update({ id }, { partner_affiliate_expiry_date })
    }
}

exports.genPartnerAffiliateForMigrate = async (partnerIds) => {
    for (const partnerId of partnerIds) {
        await insertPartnerAffiliate({
            account_type: 'seller',
            partner_id: partnerId,
        })
    }
}

const getPayoutAffiliateStartDate = (endDate) =>
    endDate.clone().add(-1, 'months').add(1, 'seconds')

const genPayoutAffiliateKey = ({ startDate, endDate }) => {
    const dateFormat = 'YYYY-MM-DD'
    const keySeparator = '_'
    const keyParts = []
    keyParts.push(startDate.format(dateFormat))
    keyParts.push(endDate.format(dateFormat))
    const keyStr = keyParts.join(keySeparator)

    return keyStr
}
exports.getPayoutAffiliateTimeRange = (key) => {
    const keySeparator = '_'
    if (key.includes(keySeparator)) {
        const arr = key.split(keySeparator)
        const startDate = new Date(arr[0])
        const endDate = new Date(arr[1])

        return {
            startDate,
            endDate,
        }
    }

    return {}
}
const getPrevPayoutAffiliate = ({ startDate }) => {
    const prevEndDate = startDate.clone().add(-1, 'seconds')
    const prevStartDate = getPayoutAffiliateStartDate(prevEndDate)
    const prevkey = genPayoutAffiliateKey({
        startDate: prevStartDate,
        endDate: prevEndDate,
    })

    return {
        startDate: prevStartDate,
        endDate: prevEndDate,
        key: prevkey,
    }
}

exports.genPayoutAffiliateKey = genPayoutAffiliateKey

const getCurrPayoutAffiliate = () => {
    let endDate = moment.tz(DEBT_TIME_ZONE)

    const currDay = endDate.format('D')
    const isPayoutAtNextMonth = currDay >= AFFILIATE_PAYOUT_BEGIN_DAY
    if (isPayoutAtNextMonth) {
        endDate.add(1, 'months')
    }
    endDate.set('date', AFFILIATE_PAYOUT_BEGIN_DAY)
    endDate = endDate.startOf('day')
    endDate.add(-1, 'seconds')
    const startDate = getPayoutAffiliateStartDate(endDate)
    const key = genPayoutAffiliateKey({ startDate, endDate })

    return { startDate, endDate, key }
}
exports.getCurrPayoutAffiliate = getCurrPayoutAffiliate

exports.getPayoutAffiliateListing = (limit = 12) => {
    const result = []
    let currPayout = getCurrPayoutAffiliate()
    for (let i = 0; i < limit; i++) {
        result.push(currPayout)
        currPayout = getPrevPayoutAffiliate(currPayout)
    }

    return result
}

exports.adminGetAffiliateOfPartner = async (
    partner_id,
    register_from,
    register_to,
    keyword,
    account_status,
    is_verified,
    options
) => {
    const result = await partnerAffiliate.getPartnerAffiliates(
        {},
        async (query) => {
            query.select(
                'u.id as user_id',
                'pu.partner_id',
                'u.email',
                'u.full_name',
                'u.status',
                'u.created_at',
                'partner_affiliate. *'
            )
            query.leftJoin(
                'partner_user as pu',
                'pu.partner_id',
                'partner_affiliate.partner_id'
            )
            query.leftJoin('user as u', 'u.id', 'pu.user_id')

            if (options.tenant_id) {
                query.andWhere('u.tenant_id', options.tenant_id)
            } 
            register_from && query.andWhere('u.created_at', '>=', register_from)
            register_to && query.andWhere('u.created_at', '<=', register_to)
            account_status && query.andWhere({ 'u.status': account_status })
            is_verified &&
                query.andWhere({ 'partner_affiliate.is_verified': is_verified })
            keyword &&
                query.andWhere((builder) => {
                    builder.where('u.email', 'ilike', `%${keyword}%`)
                    builder.orWhere('u.full_name', 'ilike', `%${keyword}%`)
                    const partner_id = parseInt(keyword)
                    partner_id &&
                        builder.orWhere({
                            'partner_affiliate.partner_id': partner_id,
                        })
                })

            return await query
                .orderBy('partner_affiliate.id', 'desc')
                .paginate(options.paginate)
        }
    )

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}

exports.adminUpdatePercentCommission = async (
    id,
    first_order_percent,
    second_order_percent
) => {
    const affiliate = await partnerAffiliate.getPartnerAffiliate({ id })

    if (!affiliate) throw new Error('partner_affiliate_not_found')

    await partnerAffiliate.updatePartnerAffiliate(
        { id },
        { first_order_percent, second_order_percent }
    )
}

exports.adminUpdateAllPercentCommission = async (
    ids,
    first_order_percent,
    { trx } = {}
) => {
    ids.map(async (id) => {
        await partnerAffiliate.updatePartnerAffiliate(
            { id },
            { first_order_percent },
            trx
        )
    })
}
