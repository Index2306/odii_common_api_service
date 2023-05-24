const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { STATUS } = require('../constants')
const { getBasicSup, getBasicProduct } = require('./model-helper')

exports.insertProdcutVariation = (data, { trx } = {}) =>
    getKnex('product_variation', trx).returning('id').insert(data)

exports.getProductVariation = (condition) =>
    knex.first().from('product_variation').where(condition)

exports.getProductVariationById = (id) => exports.getProductVariation({ id })

exports.getProductVariationsByIdsAndProductId = (
    { ids, product_id },
    { trx } = {}
) =>
    getKnex('product_variation', trx)
        .select('id')
        .whereIn('id', ids)
        .andWhere('product_id', product_id)

exports.getProductVariationsByIds = (ids, { trx } = {}) =>
    getKnex('product_variation', trx).select('id').whereIn('id', ids)

exports.updateProductVariation = (condition, data, { trx } = {}) =>
    getKnex('product_variation', trx).where(condition).update(data)

exports.updateProductVariationById = (id, data, { trx } = {}) =>
    exports.updateProductVariation({ id }, data, { trx })

exports.updateProductVariationQuantity = (id, totalQuantity, { trx }) =>
    exports.updateProductVariation(
        { id },
        { total_quantity: totalQuantity },
        { trx }
    )
exports.decrementQtyProductVariation = (
    product_variation_id,
    total,
    { trx } = {}
) =>
    getKnex('product_variation', trx)
        .decrement('total_quantity', total)
        .where('id', product_variation_id)

exports.inactiveProductVariationByProducId = (productId, { trx } = {}) =>
    exports.updateProductVariation(
        { product_id: productId },
        { status: STATUS.INACTIVE },
        { trx }
    )

exports.getProductVariationsByProductId = async (productId, options = {}) => {
    const condition = {
        'product_variation.is_deleted': false,
        'product_variation.product_id': productId,
    }
    if (options.status) condition['product_variation.status'] = options.status
    const variations = await knex
        .select([
            'product_variation.*',
            knex.raw(`row_to_json("product_image".*) as thumb`),
        ])
        .from('product_variation')
        .joinRaw(
            ' LEFT JOIN product_image ON product_variation.product_image_id = product_image.id AND product_image.is_deleted = false'
        )
        .where(condition)
        .orderBy('product_variation.id', 'desc')

    return variations
}

exports.upsertProductVariations = async (data, { trx }) => {
    const insertData = data.filter((i) => !i.id)
    if (!_.isEmpty(insertData))
        await exports.insertProdcutVariation(insertData, { trx })

    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map((item) => {
            const { id, product_id, ...updateBody } = item

            const query = getKnex('product_variation', trx)
                .where({ id, product_id })
                .update(updateBody)

            return query
        })

        await Promise.all(queries)
    }

    return true
}

exports.getProductVariationDetail = async (id, option = {}) => {
    const selectArr = [
        'pv.*',
        knex.raw(`row_to_json("pi".*) as thumb`),
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        getBasicSup(),
        knex.raw('row_to_json("from".*) as from_location'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product_variation as pv')
        .joinRaw(
            ' LEFT JOIN product as p ON pv.product_id = p.id AND p.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier as s ON p.supplier_id = s.id AND s.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier_warehousing as sw ON p.supplier_warehousing_id = sw.id'
        )
        .leftJoin('location as from', 'sw.location_id', 'from.id')
        .joinRaw(
            ' LEFT JOIN product_image as pi ON pv.product_image_id = pi.id AND pi.is_deleted = false'
        )
        .leftJoin(
            'product_category_vs_product as pcp',
            'p.id',
            'pcp.product_id'
        )
        .leftJoin('product_category as pc', 'pcp.product_category_id', 'pc.id')

    const condition = {
        'pv.id': id,
        'pv.is_deleted': false,
    }

    if (option.partner_id) {
        condition['p.partner_id'] = option.partner_id
    }

    query = query.where(condition)

    // option

    const result = await query

    return result
}

exports.getProductVariationDetailForOrder = async (id, option = {}) => {
    const selectArr = [
        'pv.*',
        knex.raw(`row_to_json("pi".*) as thumb`),
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        getBasicSup(),
        getBasicProduct(),
        knex.raw('row_to_json("from".*) as from_location'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product_variation as pv')
        .joinRaw(
            ' LEFT JOIN product as p ON pv.product_id = p.id AND p.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier as s ON p.supplier_id = s.id AND s.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier_warehousing as sw ON p.supplier_warehousing_id = sw.id'
        )
        .leftJoin('location as from', 'sw.location_id', 'from.id')
        .joinRaw(
            ' LEFT JOIN product_image as pi ON pv.product_image_id = pi.id AND pi.is_deleted = false'
        )
        .leftJoin(
            'product_category_vs_product as pcp',
            'p.id',
            'pcp.product_id'
        )
        .leftJoin('product_category as pc', 'pcp.product_category_id', 'pc.id')

    const condition = {
        'pv.is_deleted': false,
    }
    if (id) {
        condition['pv.id'] = id
    }

    if (option.sku) {
        condition['pv.sku'] = option.sku
    }

    if (option.partner_id) {
        condition['p.partner_id'] = option.partner_id
    }

    query = query.where(condition)

    // option

    const result = await query

    return result
}
