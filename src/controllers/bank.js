const Joi = require('joi')
const Bank = require('../models/bank')
const Supplier = require('../models/supplier')
const { parseOption } = require('../utils/pagination')
const { ACC_TYPE, STATUS } = require('../constants')

// admin- supplier - seller source
exports.getBanks = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const { keyword, source, is_default, status, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            status: Joi.string(),
            source: Joi.string(),
            is_default: Joi.boolean(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    query.type = source

    if (source === ACC_TYPE.SUP || source === ACC_TYPE.SELLER) {
        option.partner_id = user.partner_id
        query.status = STATUS.ACTIVE
        query.is_default = is_default
    }
    const data = await Bank.getBanks(option, query)

    return {
        is_success: true,
        ...data,
    }
}
// admin- supplier - seller query Type
exports.createBank = async (request) => {
    const { user } = request
    const { source, ...value } = await Joi.object()
        .keys({
            sub_title: Joi.string(),
            account_name: Joi.string(),
            account_number: Joi.string(),
            exp_date: Joi.string(),
            bank_info_id: Joi.string(),
            source: Joi.string(),
        })
        .validateAsync(
            { ...request.body, source: request.odii_source },
            { stripUnknown: true }
        )

    value.type = source
    value.tenant_id = user.tenant_id
    if (source === ACC_TYPE.SUP || source === ACC_TYPE.SELLER) {
        value.partner_id = user.partner_id
        const bank = await Bank.getBank({
            partner_id: user.partner_id,
            type: source,
            status: STATUS.ACTIVE,
        })
        if (!bank) value.is_default = true
    }

    const [id] = await Bank.insertBank(value)

    return {
        is_success: true,
        data: { id },
    }
}

exports.updateBank = async (request) => {
    const { user } = request
    const { id, source, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            sub_title: Joi.string(),
            account_name: Joi.string(),
            account_number: Joi.string(),
            exp_date: Joi.string(),
            bank_info_id: Joi.string(),
            status: Joi.string(),
            source: Joi.string(),
            is_default: Joi.boolean(),
        })
        .validateAsync(
            { ...request.body, ...request.params, source: request.odii_source },
            { stripUnknown: true }
        )
    if (source === ACC_TYPE.SUP || source === ACC_TYPE.SELLER) {
        const bank = await Bank.getBank({ id, partner_id: user.partner_id })
        if (!bank) {
            throw new Error('bank_id_not_found or not partner_id')
        }
        if (body.is_default) {
            await Bank.deleteDefaultBank(
                { partner_id: user.partner_id, type: source },
                { is_default: false }
            )
        }
    }
    await Bank.updateBankById(id, body)

    return {
        is_success: true,
    }
}
exports.getBankDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Bank.getBanksDetail(id)

    if (!data) {
        throw new Error('bank_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
exports.getBanksInfo = async (request) => {
    const option = parseOption(request.query)

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Bank.getBanksInfo(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.adminGetBanks = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    const { keyword, source, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            status: Joi.string(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    query.type = ACC_TYPE.ADMIN

    const data = await Bank.getBanks(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.adminGetBankDetail = async (request) => {
    const option = parseOption(request.query)
    const { id, is_default, source, ...query } = await Joi.object()
        .keys({
            id: Joi.string(),
            is_default: Joi.boolean(),
        })
        .validateAsync(
            {
                ...request.params,
                ...request.query,
                source: request.odii_source,
            },
            { stripUnknown: false, allowUnknown: true }
        )
    const supplier = await Supplier.getSupplierById(id)
    if (!supplier) throw new Error('supplier_not_found')

    option.partner_id = supplier.partner_id

    query.is_default = is_default

    const data = await Bank.getBanks(option, query)

    return {
        is_success: true,
        ...data,
    }
}
