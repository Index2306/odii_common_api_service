const Joi = require('joi')
const New = require('../models/news')
const { parseOption } = require('../utils/pagination')
// const Attribute = require('../models/store-category-attribute')

exports.getNews = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await New.getNews(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createNew = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            title: Joi.string().required(),
            content: Joi.string(),
            thumb: Joi.object().allow(null),
            featured_image: Joi.object().allow(null),
            description: Joi.string(),
            type: Joi.string(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.user_id = user.id

    await New.insertNew(value)

    return {
        is_success: true,
    }
}

exports.updateNew = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            title: Joi.string().required(),
            content: Joi.string(),
            thumb: Joi.object().allow(null),
            featured_image: Joi.object().allow(null),
            description: Joi.string(),
            type: Joi.string(),
            status: Joi.string(),
            publish_status: Joi.string(),
            is_deleted: Joi.boolean(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const news = await New.getNewById(id)

    if (!news) {
        throw new Error('New_id_not_found')
    }

    const data = await New.updateNewById(id, body)
    const success = data[0] !== 0

    return {
        success,
    }
}

exports.getNewDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await New.getNewById(id)

    if (!data) {
        throw new Error('New_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
