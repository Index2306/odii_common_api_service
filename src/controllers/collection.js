/* eslint-disable camelcase */
const Joi = require('joi')
const Collection = require('../models/collection')
const {
    STATUS,
    STATUS_ARR,
    COLLECTION_DISJUNCTIVE_ARR,
    COLLECTION_TYPE,
} = require('../constants')
const { parseOption } = require('../utils/pagination')

exports.createCollection = async (request) => {
    const value = await Joi.object()
        .keys({
            store_id: Joi.string().required(),
            collection_type: Joi.string()
                .allow(...STATUS_ARR, null)
                .required(),
            description: Joi.string().optional(),
            status: Joi.string()
                .allow(...STATUS_ARR, null)
                .default(STATUS.ACTIVE),
            image: Joi.object().allow(null),
            name: Joi.string().allow(null),
            sort_order: Joi.string().allow(null),
            rules: Joi.object().allow(null),
            disjunctive: Joi.string().allow(
                ...COLLECTION_DISJUNCTIVE_ARR,
                null
            ),
        })
        .validateAsync(request.body, { stripUnknown: true })
    const data = await Collection.insertCollection(value)

    return {
        success: data[0] !== '0',
    }
}

exports.updateCollection = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            description: Joi.string().optional(),
            status: Joi.string()
                .allow(...STATUS_ARR, null)
                .default(STATUS.ACTIVE),
            image: Joi.object().allow(null),
            name: Joi.string().allow(null),
            sort_order: Joi.string().allow(null),
            rules: Joi.object().allow(null),
            disjunctive: Joi.string().allow(
                ...COLLECTION_DISJUNCTIVE_ARR,
                null
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const data = await Collection.updateCollectionById(id, body)

    return {
        success: data[0] !== '0',
    }
}

exports.collectProduct = async (request) => {
    const { id, product_id, position } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            product_id: Joi.string().required(),
            position: Joi.number().integer().allow(null).default(99),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const data = await Collection.insertCollect({
        collection_id: id,
        product_id,
        position,
    })

    return {
        success: data[0] !== '0',
    }
}

exports.getCollection = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const data = await Collection.getCollectionById(id)

    return {
        is_success: true,
        data,
    }
}

exports.getCollections = async (request) => {
    const option = parseOption(request.query)
    const data = await Collection.getCollectionListing(option, request.query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getCollectionProducts = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const collection = await Collection.getCollectionById(id)
    const option = parseOption(request.query)

    let products

    if (collection.collection_type === COLLECTION_TYPE.MANUAL) {
        products = await Collection.getProductsOfManualCollection(
            option,
            collection
        )
    } else if (collection.collection_type === COLLECTION_TYPE.AUTO) {
        products = await Collection.getProductsOfAutoCollection(
            option,
            collection
        )
    }

    return {
        is_success: true,
        data: { collection, ...products },
    }
}
