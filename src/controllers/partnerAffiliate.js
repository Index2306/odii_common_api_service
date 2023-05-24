const Joi = require('joi')
const { ACC_TYPE } = require('../constants')
const partnerAffiliateService = require('../services/partner-affiliate.service')
const { parseIsoString } = require('../utils/datetime.util')
const { parseOption } = require('../utils/pagination')

exports.getPartnerAffiliateDetail = async (request) => {
    const { user } = request
    const partnerId = user.partner_id
    const data = await partnerAffiliateService.getPartnerAffiliateByPartnerId(
        partnerId
    )

    return {
        is_success: true,
        data,
    }
}

exports.verifyPartnerAffiliate = async (request) => {
    const { user } = request
    const partnerId = user.partner_id
    await partnerAffiliateService.verifyPartnerAffiliate(partnerId)

    return {
        is_success: true,
    }
}

exports.getAffiliateOfPartner = async (request) => {
    const { user } = request
    const partnerId = user.partner_id

    const paginator = parseOption(request.query)
    let { register_from, register_to, keyword, account_status } =
        await Joi.object()
            .keys({
                register_from: Joi.string().optional(),
                register_to: Joi.string().optional(),
                keyword: Joi.string().optional(),
                account_status: Joi.string().optional(),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )

    if (register_from) {
        register_from = parseIsoString(register_from)
    }
    if (register_to) {
        register_to = parseIsoString(register_to)
    }
    const data = await partnerAffiliateService.getAffiliateOfPartner(
        partnerId,
        register_from,
        register_to,
        keyword,
        account_status,
        paginator
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.updateAffiliateForMaintain = async () => {
    await partnerAffiliateService.updateAffiliateForMaintain()

    return {
        is_success: true,
    }
}

exports.genPartnerAffiliateForMigrate = async (request) => {
    const { partner_ids } = await Joi.object()
        .keys({
            partner_ids: Joi.string().required(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    await partnerAffiliateService.genPartnerAffiliateForMigrate(
        partner_ids.split(',')
    )

    return {
        is_success: true,
    }
}

exports.getPayoutAffiliateListing = async (request) => {
    const { limit } = await Joi.object()
        .keys({
            limit: Joi.number().optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = partnerAffiliateService.getPayoutAffiliateListing(limit)

    return {
        is_success: true,
        data,
    }
}

exports.adminUpdatePercentCommission = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    const { id, first_order_percent, second_order_percent } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            first_order_percent: Joi.number().required(),
            second_order_percent: Joi.number().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    await partnerAffiliateService.adminUpdatePercentCommission(
        id,
        first_order_percent,
        second_order_percent
    )

    return {
        is_success: true,
    }
}

exports.adminUpdateAllPercentCommission = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    const { ids, first_order_percent } = await Joi.object()
        .keys({
            first_order_percent: Joi.number().required(),
            ids: Joi.array().items(Joi.string().required()),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    await partnerAffiliateService.adminUpdateAllPercentCommission(
        ids,
        first_order_percent
    )

    return {
        is_success: true,
    }
}

exports.adminGetListPartnerAff = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    let {
        register_from,
        register_to,
        keyword,
        partner_id,
        account_status,
        is_verified,
    } = await Joi.object()
        .keys({
            register_from: Joi.string().optional(),
            register_to: Joi.string().optional(),
            keyword: Joi.string().optional(),
            account_status: Joi.string().optional(),
            partner_id: Joi.string().optional(),
            is_verified: Joi.boolean().optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )

    if (register_from) {
        register_from = parseIsoString(register_from)
    }
    if (register_to) {
        register_to = parseIsoString(register_to)
    }
    const data = await partnerAffiliateService.adminGetAffiliateOfPartner(
        partner_id,
        register_from,
        register_to,
        keyword,
        account_status,
        is_verified,
        option
    )

    return {
        is_success: true,
        ...data,
    }
}
