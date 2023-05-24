const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.insertCollection = (data) =>
    knex('collection').returning('id').insert(data)

exports.updateCollection = (condition, data) =>
    knex('collection').where(condition).update(data)

exports.updateCollectionById = (id, data) =>
    exports.updateCollection({ id }, data)

exports.getCollections = (condition) =>
    knex.select().from('collection').where(condition)

exports.getCollection = (condition) =>
    knex.first().from('collection').where(condition)

exports.getCollectionById = (id) => exports.getCollection({ id })

exports.getCollectionListing = async (options = {}, whereCondition) => {
    let query = knex.select().from('collection')

    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.name) {
            query = query.where((builder) => {
                builder
                    .where('name', 'ilike', `%${whereCondition.name}%`)
                    .orWhere('id', whereCondition.name)

                return builder
            })
        }
    }

    const result = await query
        .orderBy(options.order_by || 'collection.id', options.order_direction)
        .paginate(options.paginate)

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

/** MANUAL COLLECT */

exports.insertCollect = (data) => knex('collect').returning('id').insert(data)

exports.updateCollect = (condition, data) =>
    knex('collect').where(condition).update(data)

exports.deleteCollect = (condition) => knex('collect').where(condition).del()

exports.deleteCollectById = (id) => exports.deleteCollect({ id })

exports.getProductsOfManualCollection = async (options = {}, collection) => {
    const query = knex
        .select('product.*')
        .from('product')
        .leftJoin('collect', 'collect.product_id', 'product.id')
        .leftJoin('collection', 'collect.collection_id', 'collection.id')
        .where('product.is_deleted', false)
        .andWhere('collection.id', collection.id)
        .groupBy('product.id')

    const result = await query
        .orderBy(options.order_by || 'collection.id', options.order_direction)
        .paginate(options.paginate)

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

exports.FIELDS = {
    PRODUCT_NAME: 'product_name',
    PRODUCT_VENDOR: 'product_vendor',
    PRODUCT_RETAIL_PRICE: 'product_retail_price',
    PRODUCT_ORIGIN_PRICE: 'product_origin_price',
    PRODUCT_TAG: 'product_tag',
}

exports.COMPARE_TYPE = {
    EQUAL: 'equal',
    NOT_EQUAL: 'not_equal',
    GREATER: 'greater',
    LESS: 'less',
}

exports.DISJUNCTIVE = {
    AND: 'and',
    OR: 'or',
}

exports.getProductsOfAutoCollection = async (options = {}, collection) => {
    let query = knex
        .select('product.*')
        .from('product')
        // .leftJoin('collect', 'collection.id', 'collect.collection_id')
        // .leftJoin('product', 'collect.product_id', 'product.id')
        .where('product.is_deleted', false)
    // .andWhere('collection.id', collection.id)
    // .andWhere(...['collection.id', collection.id])
    // .groupBy('product_variation.id')

    if (!_.isEmpty(collection.rules)) {
        // eslint-disable-next-line no-restricted-syntax
        for (const rule of collection.rules) {
            const condition = []
            // FIELD
            if (rule.field === exports.FIELDS.PRODUCT_NAME) {
                condition.push('product.name')
            } else if (rule.field === exports.FIELDS.PRODUCT_VENDOR) {
                condition.push('product.vendor')
            } else if (rule.field === exports.FIELDS.PRODUCT_RETAIL_PRICE) {
                condition.push('product.retail_price')
            } else if (rule.field === exports.FIELDS.PRODUCT_ORIGIN_PRICE) {
                condition.push('product.origin_price')
            } else if (rule.field === exports.FIELDS.PRODUCT_TAG) {
                // eslint-disable-next-line no-loop-func
                query = query.where((builder) => {
                    builder.where(
                        `JSON_OVERLAPS(tags, '${rule.compare_value}')`
                    )

                    return builder
                })
            }
            // COMPARE
            if (rule.compare === exports.COMPARE_TYPE.EQUAL) {
                condition.push(rule.compare_value)
            } else if (rule.compare === exports.COMPARE_TYPE.GREATER) {
                condition.push('>=')
                condition.push(rule.compare_value)
            } else if (rule.compare === exports.COMPARE_TYPE.LESS) {
                condition.push('<=')
                condition.push(rule.compare_value)
            }

            // COMPARE VALUE
            if (rule.field !== exports.FIELDS.PRODUCT_TAG)
                if (rule.disjunctive === exports.DISJUNCTIVE.AND) {
                    query = query.andWhere(...condition)
                } else if (rule.disjunctive === exports.DISJUNCTIVE.OR) {
                    query = query.orWhere(...condition)
                }
        }
    }

    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
        .paginate(options.paginate)

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
