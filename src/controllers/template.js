const Joi = require('joi')
const Template = require('../models/template')
const { STATUS } = require('../constants')
const { parseOption } = require('../utils/pagination')
const DesignService = require('../services/design')

exports.getTemplates = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Template.getTemplates(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createTemplate = async (request) => {
    const { user } = request

    const value = await Joi.object()
        .keys({
            name: Joi.string().required(),
            type: Joi.string(),
            description: Joi.string(),
            thumb: Joi.object().allow(null),
            designs: Joi.array().items(
                Joi.object().keys({
                    name: Joi.string().required(),
                    layers: Joi.array().items(Joi.object()),
                    type: Joi.string(),
                })
            ),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.partner_id = user.partner_id

    value.status = STATUS.ACTIVE

    value.display_status = STATUS.ACTIVE

    if (user.tenant_id) {
        value.tenant_id = user.tenant_id
    }

    const data = await DesignService.createTemplate(user, value)

    return {
        is_success: true,
        data,
    }
}

exports.updateTemplate = async (request) => {
    const { user } = request
    const { id, designs, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            description: Joi.string(),
            type: Joi.string(),
            status: Joi.string(),
            display_status: Joi.string(),
            thumb: Joi.object().allow(null),
            is_deleted: Joi.boolean(),
            designs: Joi.array().items(
                Joi.object().keys({
                    id: Joi.string().optional(),
                    name: Joi.string().required(),
                    layers: Joi.array().items(Joi.object()),
                    type: Joi.string(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const currentTemplate = await Template.getTemplateById(id)

    if (!currentTemplate) throw new Error('Template_id_not_found')

    const data = await DesignService.updateTemplate(user, {
        id,
        designs,
        ...body,
    })

    return {
        is_success: true,
        data,
    }
}

exports.getTemplateDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Template.getTemplateById(id)

    if (!data) {
        throw new Error('Template_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.getIgmEditorFrameTemplate = async (request) => {
    const { user } = request
    const data = await Template.getDetailTemplate({
        type: 'sample_frame_template',
        status: 'active',
        design_status: 'active',
        tenant_id: user.tenant_id,
    })

    if (!data) {
        throw new Error('template_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
