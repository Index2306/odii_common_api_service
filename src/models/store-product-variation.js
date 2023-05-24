const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { STATUS } = require('../constants')
const { removeEmpty } = require('../utils/common.util')

exports.LIST_COLS = [
    'id',
    'name',
    'store_id',
    'partner_id',
    'sku',
    'product_variation_id',
    'currency_code',
    'status',
    'barcode',
    'is_deleted',
    'thumb',
    'vendor',
    'option_1',
    'option_2',
    'option_3',
    'created_at',
    // 'attributes',
    'updated_at',
    'shop_product_variation_id',
    'platform',
    'origin_supplier_price',
    'retail_price',
    'retail_price_compare_at',
    'total_quantity',
    'is_default',
    'box_width_cm',
    'box_height_cm',
    'box_length_cm',
    'weight_grams',
    'store_product_id',
    'product_id',
    'store_product_image_id',
    'platform_extra_attributes',
]

exports.FULL_FIELDS = [...exports.LIST_COLS]

exports.reformat = (body) => removeEmpty(_.pick(body, exports.FULL_FIELDS))

exports.insert = (data, { trx } = {}) =>
    getKnex('store_product_variation', trx).returning('id').insert(data)

exports.getOne = (condition) =>
    knex.first().from('store_product_variation').where(condition)

exports.getById = (id) => exports.getOne({ id })

exports.getManyByIds = (ids, { trx } = {}) =>
    getKnex('store_product_variation', trx).select('id').whereIn('id', ids)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('store_product_variation', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.delete = (condition, { trx } = {}) =>
    getKnex('store_product_variation', trx).where(condition).del()

exports.inactiveProductVariationByProducId = (productId, { trx } = {}) =>
    exports.update(
        { product_id: productId },
        { status: STATUS.INACTIVE },
        { trx }
    )

exports.getManyByProductId = async (productId, options = {}) => {
    const condition = {
        'store_product_variation.is_deleted': false,
        'store_product_variation.store_product_id': productId,
    }
    if (options.status)
        condition['store_product_variation.status'] = options.status

    let variations = await knex
        .select([
            'store_product_variation.*',
            'prvst.total_quantity as total_quantity',
            'prv.low_retail_price as low_retail_price',
            'prv.recommend_retail_price as recommend_retail_price',
            knex.raw(`row_to_json("store_product_image".*) as thumb`),
            knex.raw(
                `json_build_object('id', sw.id, 'location_id', sw.location_id, 'name', sw.name) as supplier_warehousing`
            ),
        ])
        .from('store_product_variation')
        .joinRaw(
            ' LEFT JOIN store_product_image ON store_product_variation.store_product_image_id = store_product_image.id AND store_product_image.is_deleted = false'
        )
        .innerJoin(
            'product_variation as prv',
            'prv.id',
            'store_product_variation.product_variation_id'
        )
        .innerJoin(
            'product_variation_stock as prvst',
            'prvst.id',
            'store_product_variation.product_variation_stock_id'
        )
        .joinRaw(
            `LEFT JOIN product as sp ON store_product_variation.product_id = sp.id`
        )
        .joinRaw(
            `LEFT JOIN product_stock as pst ON store_product_variation.product_stock_id = pst.id`
        )
        .innerJoin(
            'supplier_warehousing as sw',
            'pst.supplier_warehousing_id',
            'sw.id'
        )
        .where(condition)
        .orderBy('store_product_variation.id', 'desc')

    const allDatas = variations.map(async (item) => {
        const promotionData = await knex
            .select([
                'prt.*',
                'pr.product_id',
                'pr.variation_id',
                knex.raw(`row_to_json(pr.*) as promotion_product`),
            ])
            .first()
            .from('promotion as prt')
            .innerJoin('promotion_product as pr', 'prt.id', 'pr.promotion_id')
            .joinRaw(
                `INNER JOIN store_product as sp ON prt.id = sp.promotion_id AND sp.product_id = pr.product_id`
            )
            .where({ 'pr.variation_id': item.product_variation_id })
            .andWhere({ 'pr.product_id': item.product_id })
            .andWhere({ 'sp.is_promotion': true })
            .andWhere({ 'prt.is_approve': true })
            .andWhere({ 'prt.status_validate': 'active' })
            .andWhere({ 'pr.status': 'active' })
            .groupBy('prt.id', 'pr.id', 'sp.id')

        let options

        if (promotionData) {
            options = await knex
                .from('promotion_product_option')
                .where({
                    promotion_product_id: promotionData.promotion_product.id,
                })
                .orderBy('promotion_product_option.id', 'asc')
        }
        item.promotion = promotionData || {}
        if (!_.isEmpty(options)) {
            item.promotion.value = options[0].value
        }

        return item
    })

    variations = await Promise.all(allDatas)

    return variations
}

exports.upsertMany = async (data, { trx }) => {
    const insertData = data.filter((i) => !i.id)

    if (!_.isEmpty(insertData)) await exports.insert(insertData, { trx })

    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map((item) => {
            const { id, store_product_id, ...updateBody } = item

            const query = getKnex('store_product_variation', trx)
                .where({ id, store_product_id })
                .update(removeEmpty(_.pick(updateBody, exports.LIST_COLS)))

            return query
        })

        await Promise.all(queries)
    }

    return true
}

exports.getManyByStoreProductId = async (productId, options = {}) => {
    const condition = {
        'store_product_variation.is_deleted': false,
        'store_product_variation.store_product_id': productId,
    }
    if (options.status)
        condition['store_product_variation.status'] = options.status

    let variations = await knex
        .select([
            'store_product_variation.*',
            knex.raw(`row_to_json("store_product_image".*) as thumb`),
        ])
        .from('store_product_variation')
        .joinRaw(
            ' LEFT JOIN store_product_image ON store_product_variation.store_product_image_id = store_product_image.id AND store_product_image.is_deleted = false'
        )
        .where(condition)
        .orderBy('store_product_variation.id', 'desc')

    return variations
}