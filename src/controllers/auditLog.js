const Joi = require('joi')
const AuditLog = require('../models/audit-log')
const { parseOption } = require('../utils/pagination')

exports.getAuditLogs = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await AuditLog.getAuditLogs(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createAuditLog = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            note: Joi.string(),
            type: Joi.string(),
            order_id: Joi.string().required(),
            product_id: Joi.string().required(),
            metadata: Joi.string(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.partner_id = user.partner_id

    const data = await AuditLog.insertAuditLog(value)
    const success = data[0] !== 0

    return {
        success,
    }
}

exports.updateAuditLog = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            note: Joi.string(),
            type: Joi.string(),
            metadata: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const isExistAuditLog = await AuditLog.getAuditLogById(id)

    if (!isExistAuditLog) {
        throw new Error('audit_log_id_not_found')
    }

    const data = await AuditLog.updateAuditLogById(id, body)
    const success = data[0] !== 0

    return {
        success,
    }
}
exports.getAuditLogDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await AuditLog.getAuditLogById(id)

    if (!data) {
        throw new Error('audit_log_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
exports.deleteAuditLog = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await AuditLog.getAuditLogById(id)

    if (!data) {
        throw new Error('audit_log_id_not_found')
    }

    await AuditLog.deleteAuditLogById(id)

    return {
        is_success: true,
    }
}
