const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { STATUS } = require('../constants')
const { getBasicSup, getBasicProduct } = require('./model-helper')

exports.LIST_COLS = [
    'pv.product_id',
    'pv.name',
    'pv.sku',
    'pv.barcode',
    'pv.position',
    'pv.currency_code',
    'pv.weight_grams',
    'pv.product_image_id',
    'pv.option_1',
    'pv.option_2',
    'pv.option_3',
    'pv.origin_supplier_price',
    'pv.retail_price',
    'pv.high_retail_price',
    'pv.low_retail_price',
    'pv.odii_price',
    'pv.is_default',
    'pv.odii_compare_price',
    'pv.box_width_cm',
    'pv.box_height_cm',
    'pv.box_length_cm',
    'pv.retail_price_compare_at',
    'pv.attributes',
    'pv.variation_index',
    'pv.recommend_retail_price',
    'pv.low_quantity_thres',
    'pv.is_promotion',
    'pv.promotion_id'
]

exports.insertProdcutVariationStock = (data, { trx } = {}) =>
    getKnex('product_variation_stock', trx).returning('id').insert(data)

exports.getProductVariationStock = (condition) =>
    knex.first().from('product_variation_stock').where(condition)

exports.getProductVariationStockById = (id) => exports.getProductVariationStock({ id })

exports.getProductVariationsByProductStockId = async (productStockId, options = {}) => {
    const condition = {
        'product_variation_stock.is_deleted': false,
        'product_variation_stock.product_stock_id': productStockId,
    }
    if (options.status) condition['product_variation_stock.status'] = options.status
    const variations = await knex
        .select([
            'product_variation_stock.*',
            ...exports.LIST_COLS,
            knex.raw(`row_to_json("product_image".*) as thumb`),
        ])
        .from('product_variation_stock')
        .joinRaw(
            ' INNER JOIN product_variation AS pv ON product_variation_stock.product_variation_id = pv.id AND pv.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN product_image ON pv.product_image_id = product_image.id AND product_image.is_deleted = false'
        )
        .where(condition)
        .orderBy('product_variation_stock.id', 'desc')

    return variations
}

exports.getProductVariationsStockByIdsAndProductStockId = (
    { ids, product_stock_id },
    { trx } = {}
) =>
    getKnex('product_variation_stock', trx)
        .select('id')
        .whereIn('id', ids)
        .andWhere('product_stock_id', product_stock_id)

exports.upsertProductVariationsStock = async (data, { trx }) => {
    const insertData = data.filter((i) => !i.id)
    if (!_.isEmpty(insertData))
        await exports.insertProdcutVariationStock(insertData, { trx })

    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map((item) => {
            const { id, product_stock_id, ...updateBody } = item

            const query = getKnex('product_variation_stock', trx)
                .where({ id, product_stock_id })
                .update(updateBody)

            return query
        })

        await Promise.all(queries)
    }

    return true
}

exports.updateProductVariationStock = (condition, data, { trx } = {}) =>
    getKnex('product_variation_stock', trx).where(condition).update(data)

exports.updateProductVariationStockById = (id, data, { trx } = {}) =>
    exports.updateProductVariationStock({ id }, data, { trx })

exports.updateProductVariationStockQuantity = (id, totalQuantity, realQuantity, { trx }) =>
    exports.updateProductVariationStock(
        { id },
        { total_quantity: totalQuantity, real_quantity: realQuantity },
        { trx }
    )

exports.getProductVariationStockDetail = async (id, option = {}) => {
    const selectArr = [
        'pvst.*',
        ...exports.LIST_COLS,
        knex.raw(`row_to_json("pi".*) as thumb`),
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        getBasicSup(),
        knex.raw('row_to_json("from".*) as from_location'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product_variation_stock as pvst')
        .joinRaw(
            ' LEFT JOIN product_variation as pv ON pvst.product_variation_id = pv.id AND pv.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN product_stock as pst ON pvst.product_stock_id = pst.id AND pst.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN product as p ON pst.product_id = p.id AND p.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier as s ON p.supplier_id = s.id AND s.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier_warehousing as sw ON pst.supplier_warehousing_id = sw.id'
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
        'pvst.id': id,
        'pvst.is_deleted': false,
    }

    if (option.partner_id) {
        condition['p.partner_id'] = option.partner_id
    }

    query = query.where(condition)

    // option

    const result = await query

    return result
}
exports.getProductVariationStockDetailForOrder = async (id, option = {}) => {
    const selectArr = [
        'pvst.*',
        ...exports.LIST_COLS,
        knex.raw(`row_to_json("pi".*) as thumb`),
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        getBasicSup(),
        getBasicProduct(),
        knex.raw('row_to_json("from".*) as from_location'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product_variation_stock as pvst')
        .joinRaw(
            ' LEFT JOIN product_variation as pv ON pvst.product_variation_id = pv.id AND pv.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN product_stock as pst ON pvst.product_stock_id = pst.id AND pst.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN product as p ON pst.product_id = p.id AND p.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier as s ON p.supplier_id = s.id AND s.is_deleted = false'
        )
        .joinRaw(
            ' LEFT JOIN supplier_warehousing as sw ON pst.supplier_warehousing_id = sw.id'
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
        'pvst.is_deleted': false,
    }
    if (id) {
        condition['pvst.id'] = id
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

exports.decrementQtyProductVariationStock = (
    product_variation_stock_id,
    total,
    { trx } = {}
) =>
    getKnex('product_variation_stock', trx)
        .decrement('real_quantity', total)
        .decrement('total_quantity', total)
        .where('id', product_variation_stock_id)

exports.incrementQtyProductVariationStock = (
    product_variation_stock_id,
    total,
    { trx } = {}
) =>
    getKnex('product_variation_stock', trx)
        .increment('real_quantity', total)
        .increment('total_quantity', total)
        .where('id', product_variation_stock_id)