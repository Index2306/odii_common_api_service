const Joi = require('joi')
const _ = require('lodash')
const Design = require('../models/design')
const { STATUS } = require('../constants')
const { parseOption } = require('../utils/pagination')

exports.getDesigns = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Design.getDesigns(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createDesign = async (request) => {
    const { user } = request

    const value = await Joi.object()
        .keys({
            artwork_template_id: Joi.string().required(),
            name: Joi.string().required(),
            layers: Joi.array().items(Joi.object()),
            type: Joi.string(),
            thumb: Joi.object().allow(null),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.partner_id = user.partner_id

    value.status = STATUS.ACTIVE

    value.display_status = STATUS.ACTIVE

    if (!_.isEmpty(value.layers)) value.layers = JSON.stringify(value.layers)
    else value.layers = '[]'

    const [id] = await Design.insertDesign(value)

    return {
        is_success: true,
        data: { id },
    }
}

exports.updateDesign = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            artwork_template_id: Joi.string(),
            name: Joi.string(),
            layers: Joi.array().items(Joi.object()),
            type: Joi.string(),
            status: Joi.string(),
            display_status: Joi.string(),
            thumb: Joi.object().allow(null),
            is_deleted: Joi.boolean(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const design = await Design.getDesignById(id)

    if (!design) {
        throw new Error('Design_id_not_found')
    }
    if (!_.isEmpty(body.layers)) body.layers = JSON.stringify(body.layers)

    await Design.updateDesignById(id, body)

    return {
        is_success: true,
    }
}
exports.getDesignDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Design.getDesignById(id)

    if (!data) {
        throw new Error('Design_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
