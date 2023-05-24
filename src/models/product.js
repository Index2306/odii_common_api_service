/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { some } from 'lodash'
import Logger from '../logger'

const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { redisClient } = require('../connections/redis-cache')
const { STATUS, STATUS_ITEM } = require('../constants')
const ProductVariation = require('./product-variation')
const ProductStockVariation = require('./product-variation-stock')
const ProductImage = require('./product-image')
const { getBasicSup, getBasicSupWithSetting } = require('./model-helper')
const { mappingProductDiscount } = require('../services/product')
const {
    PRODUCT_STATUS_ARR,
    PRODUCT_STATUS_MAP,
} = require('../constants/oms-status')

exports.LIST_COLS = [
    'p.partner_id',
    'p.name',
    'p.vendor',
    'p.thumb',
    'p.size_chart',
    'p.tags',
    'p.sku',
    'p.barcode',
    'p.option_1',
    'p.option_2',
    'p.option_3',
    'p.origin_supplier_price',
    'p.odii_price',
    'p.odii_compare_price',
    'p.short_desc',
    'p.currency_code',
    'p.high_retail_price',
    'p.low_retail_price',
    'p.number_of_variation',
    'p.publish_status',
    'p.has_variation',
    'p.number_of_times_pushed',
    'p.min_price_variation',
    'p.max_price_variation',
    'p.number_of_booking',
    'p.number_of_vote',
    'p.rating',
    'p.product_category_id',
    'p.product_categories_array',
    'p.product_discount_metadata',
    'p.recommend_retail_price',
    'p.min_recommend_variation_price',
    'p.max_recommend_variation_price',
    'p.low_quantity_thres',
    'p.product_source_id',
    'p.is_promotion',
]

exports.insert = (data, { trx } = {}) =>
    getKnex('product', trx).returning('id').insert(data)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('product', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.getMany = (condition) => knex.select().from('product').where(condition)

exports.getByIdsForOrderStats = (ids, condition) =>
    knex
        .select([
            'id',
            'name',
            'sku',
            'barcode',
            'status',
            'thumb',
            'vendor',
            'min_price_variation',
            'max_price_variation',
        ])
        .from('product')
        .whereIn('id', ids)
        .andWhere(condition)

exports.getOne = (condition) => knex.first().from('product').where(condition)

exports.getOneById = (id) => exports.getOne({ id })

exports.getProductListingV2 = async (options = {}, whereCondition) => {
    // console.log('run getProductListingV2')
    const selectArr = [
        'pst.id',
        'p.id as product_id',
        ...exports.LIST_COLS,
        'pst.total_quantity',
        'pst.real_quantity',
        'pst.status',
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        knex.raw('row_to_json("swret".*) as supplier_warehousing_ret'),
        // knex.raw('row_to_json("s".*) as supplier'),
        getBasicSup(),
        knex.raw('row_to_json("from".*) as from_location'),
        knex.raw('row_to_json("pc".*) as product_category'),
        knex.raw('row_to_json("toppc".*) as top_category'),
        knex.raw(
            '(select case when min(product_variation_stock.total_quantity) <= 0 then 0 when min(product_variation_stock.total_quantity - product_variation.low_quantity_thres) <= 0 then 1 else 2 end as variation_quantity_type from product_variation_stock inner join product_variation on product_variation_stock.product_variation_id = product_variation.id where product_stock_id = pst.id) as variation_quantity_type'
        ),
        knex.raw(
            '(select case when pst.total_quantity <= 0 then 0 when pst.total_quantity <= p.low_quantity_thres then 1 else 2 end) as quantity_type'
        ),
    ]

    // Counter for supplier product list
    const counterQuery = knex
        .first()
        .count('p.id')
        .from('product as p')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'p.supplier_warehousing_id',
            'sw.id'
        )
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
    const query = knex
        .select(selectArr)
        .from('product_stock as pst')
        .innerJoin('product as p', 'pst.product_id', 'p.id')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'pst.supplier_warehousing_id',
            'sw.id'
        )
        .leftJoin(
            'supplier_warehousing as swret',
            'pst.supplier_warehouse_return_id',
            'swret.id'
        )
        .innerJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')
        .leftJoin('product_source as ps', 'p.product_source_id', 'ps.id')
        .where('pst.is_deleted', false)

    const condition = {
        'p.is_deleted': false,
        's.is_deleted': false,
    }
    if (options.status) {
        condition['p.status'] = options.status
    }

    if (options.product_stock_status) {
        query.where('pst.status', options.product_stock_status)
    }

    if (options.seller_listing) {
        query.where('pst.status', options.seller_listing)
    }

    if (options.tenant_id) condition['p.tenant_id'] = options.tenant_id
    else condition['p.tenant_id'] = null

    if (options.partner_id && !options.product_source_ids) {
        condition['p.partner_id'] = options.partner_id
    }

    if (options.supplier_id && !options.product_source_ids) {
        condition['p.supplier_id'] = options.supplier_id
    }
    if (options.publish_status) {
        condition['p.publish_status'] = options.publish_status
    }

    if (options.product_source_ids) {
        query.whereIn('p.product_source_id', options.product_source_ids)
        counterQuery.whereIn('p.product_source_id', options.product_source_ids)
    }

    if (options.warehousing_id) {
        condition['sw.id'] = options.warehousing_id
    }

    query.where(condition)

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder
                    .where('p.name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'toppc.name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere('sw.name', 'ilike', `%${whereCondition.keyword}%`)

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
            counterQuery.andWhere((builder) => {
                builder
                    .where('p.name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'toppc.name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere('sw.name', 'ilike', `%${whereCondition.keyword}%`)

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }

        if (whereCondition.from_province_code) {
            query.andWhere(
                'from.province_code',
                whereCondition.from_province_code
            )
        }

        if (whereCondition.from_province_id) {
            query.andWhere('from.province_id', whereCondition.from_province_id)
        }

        if (whereCondition.from_district_id) {
            query.andWhere('from.district_id', whereCondition.from_district_id)
        }
        if (whereCondition.supplier_id) {
            query.andWhere('p.supplier_id', whereCondition.supplier_id)
        }

        if (whereCondition.supplier_warehousing_id) {
            query.andWhere(
                'p.supplier_warehousing_id',
                whereCondition.supplier_warehousing_id
            )
        }
        if (whereCondition.supplier_warehousing_ret_id) {
            query.andWhere(
                'p.supplier_warehouse_return_id',
                whereCondition.supplier_warehousing_ret_id
            )
        }
        if (whereCondition.status) {
            query.andWhere('p.status', whereCondition.status)
        }
        if (whereCondition.publish_status) {
            query.andWhere('p.publish_status', whereCondition.publish_status)
        }

        if (whereCondition?.from_rating)
            query.andWhere('p.rating', '>=', whereCondition.from_rating)

        if (whereCondition?.to_rating)
            query.andWhere('p.rating', '<=', whereCondition.to_rating)

        if (whereCondition?.from_price)
            query.andWhere(
                'p.min_price_variation',
                '>=',
                whereCondition.from_price
            )
        if (whereCondition?.to_price)
            query.andWhere(
                'p.max_price_variation',
                '<=',
                whereCondition.to_price
            )

        if (whereCondition?.from_total_quantity)
            query.andWhere(
                'pst.total_quantity',
                '>=',
                whereCondition.from_total_quantity
            )

        if (whereCondition?.to_total_quantity)
            query.andWhere(
                'pst.total_quantity',
                '<=',
                whereCondition.to_total_quantity
            )

        if (whereCondition?.from_number_of_times_pushed)
            query.andWhere(
                'p.number_of_times_pushed',
                '>=',
                whereCondition.from_number_of_times_pushed
            )

        if (whereCondition?.to_number_of_times_pushed)
            query.andWhere(
                'p.number_of_times_pushed',
                '<=',
                whereCondition.to_number_of_times_pushed
            )

        if (
            whereCondition?.has_variation === false ||
            whereCondition?.has_variation === true
        )
            query.andWhere('p.has_variation', whereCondition.has_variation)

        if (!_.isEmpty(whereCondition.tag)) {
            if (_.isArray(whereCondition.tag))
                query.whereRaw(
                    `p.tags \\?| array[${whereCondition.tag
                        .map((item) => `'${item}'`)
                        .join(', ')}]`
                )
            else query.whereRaw(`p.tags \\?| array['${whereCondition.tag}']`)
        }

        if (!_.isEmpty(whereCondition.category_id)) {
            if (_.isArray(whereCondition.category_id))
                query.whereRaw(
                    `p.product_categories_array \\?| array[${whereCondition.category_id
                        .map((item) => `'${item}'`)
                        .join(', ')}]`
                )
            else {
                query.andWhere((builder) => {
                    builder.whereRaw(
                        `p.product_categories_array \\?| array['${whereCondition.category_id}']`
                    )
                    if (!_.isEmpty(whereCondition.child_category_id)) {
                        if (_.isArray(whereCondition.child_category_id)) {
                            builder.whereRaw(
                                `p.product_categories_array \\?| array[${whereCondition.child_category_id
                                    .map((item) => `'${item}'`)
                                    .join(', ')}]`
                            )
                        } else {
                            builder.whereRaw(
                                `p.product_categories_array \\?| array['${whereCondition.child_category_id}']`
                            )
                        }
                    }

                    return builder
                })
            }
            // query.whereRaw(
            //     `p.product_categories_array \\?| array['${whereCondition.category_id}']`
            // )
        }

        if (!_.isEmpty(whereCondition.filter_quantity)) {
            query.andWhere((builder) => {
                for (const rangeValue of whereCondition.filter_quantity) {
                    builder.orWhere((builder2) => {
                        builder2.andWhere(
                            'pst.total_quantity',
                            '>=',
                            rangeValue.from
                        )
                        if (rangeValue.to)
                            builder2.andWhere(
                                'pst.total_quantity',
                                '<=',
                                rangeValue.to
                            )

                        return builder2
                    })
                }

                return builder
            })
        }

        if (!_.isEmpty(whereCondition.filter_times_pushed)) {
            query.andWhere((builder) => {
                for (const rangeValue of whereCondition.filter_times_pushed) {
                    builder.orWhere((builder2) => {
                        builder2.andWhere(
                            'p.number_of_times_pushed',
                            '>=',
                            rangeValue.from
                        )
                        if (rangeValue.to)
                            builder2.andWhere(
                                'p.number_of_times_pushed',
                                '<=',
                                rangeValue.to
                            )

                        return builder2
                    })
                }

                return builder
            })
        }
    }

    if (!options.partner_id && options.is_admin_listing) {
        query.andWhere((builder) => {
            for (const rangeValue of STATUS_ITEM)
                builder.orWhere((builder2) => {
                    builder2
                        .andWhere('p.status', '=', rangeValue)
                        .andWhere('p.publish_status', '!=', STATUS.INACTIVE)

                    return builder2
                })

            return builder
        })
    }
    // Filter by quantity type
    if (whereCondition.quantity) {
        query.andWhere((builder) => {
            if (whereCondition.quantity === 'low') {
                builder
                    .whereRaw(
                        'p.has_variation = false and p.total_quantity > 0 and p.total_quantity <= p.low_quantity_thres'
                    )
                    .orWhereRaw(
                        'p.has_variation = true and (select count(1) from product_variation pv where pv.product_id = p.id and pv.is_deleted = false and pv.total_quantity > 0 and pv.total_quantity <= pv.low_quantity_thres) > 0'
                    )
            } else if (whereCondition.quantity === 'zero') {
                builder
                    .whereRaw(
                        'p.has_variation = false and p.total_quantity <= 0 '
                    )
                    .orWhereRaw(
                        'p.has_variation = true and (select count(1) from product_variation pv where pv.product_id = p.id and pv.is_deleted = false and pv.total_quantity <= 0 ) > 0'
                    )
            }

            return builder
        })
    }

    query.groupBy(
        'pst.id',
        'p.id',
        's.id',
        'sw.id',
        'swret.id',
        'from.id',
        'pc.id',
        'toppc.id',
        'ps.id'
    )

    const sortCondition = {
        by: 'pst.id',
        promotion: 'is_promotion',
        direction: options.order_direction,
    }
    if (options.order_by === 'updated_at') {
        sortCondition.by = 'p.updated_at'
    }
    if (options.order_by === 'created_at') {
        sortCondition.by = 'p.created_at'
    }

    if (options.order_by === 'rating') {
        sortCondition.by = 'p.rating'
    }
    if (options.order_by === 'price') {
        sortCondition.by = 'p.min_price_variation'
    }
    if (options.order_by === 'number_of_times_pushed') {
        sortCondition.by = 'p.number_of_times_pushed'
    }

    const result = await query
        .orderByRaw(
            `${sortCondition.promotion} ${sortCondition.direction}, ${sortCondition.by} ${sortCondition.direction}`
        )
        .paginate(options.paginate)

    let data
    try {
        data = mappingProductDiscount(result.data)
    } catch (e) {
        Logger.error(`[getProductListingV2] error when get`, e)
        data = result.data
    }
    // Get summary information
    const summary = []
    for (let indx = 0; indx < PRODUCT_STATUS_ARR.length; indx += 1) {
        const mapItem = PRODUCT_STATUS_MAP[PRODUCT_STATUS_ARR[indx]]
        if (mapItem) {
            if (
                mapItem.status === options.status &&
                mapItem.publish_status === options.publish_status
            ) {
                summary.push({
                    state: PRODUCT_STATUS_ARR[indx],
                    record_cnt: result.pagination.total,
                })
            } else {
                if (mapItem.status) condition['p.status'] = mapItem.status
                else delete condition['p.status']
                if (mapItem.publish_status)
                    condition['p.publish_status'] = mapItem.publish_status
                else delete condition['p.publish_status']
                const cloneSummary = counterQuery.clone()
                const resultCnt = await cloneSummary.andWhere(condition)
                summary.push({
                    state: PRODUCT_STATUS_ARR[indx],
                    record_cnt: resultCnt.count,
                })
            }
        }
    }
    if (options?.include_variation) {
        const productStockIds = data.map((item) => item.id)
        let variationData = await knex
            .select(['pvs.*',
                'pv.barcode',
                'pv.attributes',
                'pv.box_height_cm',
                'pv.box_length_cm',
                'pv.box_width_cm',
                'pv.currency_code',
                'pv.high_retail_price',
                'pv.low_quantity_thres',
                'pv.low_retail_price',
                'pv.name',
                'pv.odii_compare_price',
                'pv.odii_price',
                'pv.option_1',
                'pv.option_2',
                'pv.option_3',
                'pv.origin_supplier_price',
                'pv.position',
                'pv.product_id',
                'pv.product_image_id',
                'pv.recommend_retail_price',
                'pv.retail_price',
                'pv.retail_price_compare_at',
                'pv.sku',
                'pv.variation_index',
                'pv.weight_grams',
            ])
            .from('product_variation_stock as pvs')
            .innerJoin('product_variation as pv', 'pvs.product_variation_id', 'pv.id')
            .whereIn('pvs.product_stock_id', productStockIds)
            .andWhere({ 'pvs.is_deleted': false })
            .orderBy('pvs.id', 'desc')
        variationData = variationData.map((item) => {
            const emptyQuantity = item.total_quantity <= 0
            const lowQuantityWar =
                item.total_quantity > 0 &&
                item.total_quantity <= item.low_quantity_thres

            return {
                ...item,
                low_quantity_warn: lowQuantityWar,
                zero_quantity_warn: emptyQuantity,
            }
        })

        data = data.map((product) => ({
            ...product,
            variations: variationData.filter(
                (t) => t.product_stock_id === product.id
            ),
        }))
    }

    const productIds = data.map((item) => item.id)
    let promotionData = await knex
        .select([
            'prt.*',
            'pr.product_id',
            'pr.variation_id',
            'pv.origin_supplier_price',
            knex.raw(`row_to_json(pr.*) as promotion_product`),
        ])
        .from('promotion as prt')
        .innerJoin('promotion_product as pr', 'prt.id', 'pr.promotion_id')
        .innerJoin('product as p', 'pr.product_id', 'p.id')
        .innerJoin('product_variation as pv', 'pr.variation_id', 'pv.id')
        .whereIn('pr.product_id', productIds)
        .andWhere({ 'prt.is_deleted': false })
        .andWhere({ 'p.is_promotion': true })
        .andWhere({ 'pv.is_promotion': true })
        .andWhere({ 'prt.is_approve': true })
        .andWhere({ 'prt.status_validate': 'active' })
        .andWhere({ 'pr.status': 'active' })
        .groupBy('prt.id', 'pr.id', 'pv.id', 'p.id')

    promotionData = await Promise.all(
        promotionData.map(async (item) => {
            const options = await knex.from('promotion_product_option').where({
                promotion_product_id: item.promotion_product.id,
            })

            item.value = options[0]?.value || 0

            return item
        })
    )

    // Check low quantiy product
    data = data.map((pro) => ({
        ...pro,
        low_quantity_warn:
            (pro.has_variation && pro.variation_quantity_type === 1) ||
            (!pro.has_variation && pro.quantity_type === 1),
        zero_quantity_warn:
            (pro.has_variation && pro.variation_quantity_type === 0) ||
            (!pro.has_variation && pro.quantity_type === 0),
        promotions: promotionData.filter((prt) => prt?.product_id === pro.id),
    }))

    return {
        summary,
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data,
    }
}

/**
 * desc: product info + variant + inventory
 */

exports.getProductDetail = async (id, options = {}, variation_opt = {}) => {
    const selectArr = [
        // ...exports.LIST_COLS,
        // 'p.description',
        // 'p.short_description',
        // 'p.product_categories_metadata',
        'p.*',
        // knex.raw('row_to_json("from".*) as from_location'),
        // knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        // knex.raw('row_to_json("swret".*) as supplier_warehouse_return'),
        // knex.raw('row_to_json("s".*) as supplier'),
        getBasicSupWithSetting(),
        knex.raw('row_to_json("toppc".*) as top_category'),
        knex.raw('row_to_json("pc".*) as product_category'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product as p')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        // .innerJoin(
        //     'supplier_warehousing as sw',
        //     'p.supplier_warehousing_id',
        //     'sw.id'
        // )
        // .leftJoin(
        //     'supplier_warehousing as swret',
        //     'p.supplier_warehouse_return_id',
        //     'swret.id'
        // )
        // .innerJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')

    const condition = {
        'p.id': id,
        'p.is_deleted': false,
        's.is_deleted': false,
    }

    if (options.status) {
        condition['p.status'] = options.status
    }

    if (options.partner_id) {
        condition['p.partner_id'] = options.partner_id
    }

    query.where(condition)

    query = query.groupBy(
        'p.id',
        's.id',
        // 'sw.id',
        // 'swret.id',
        // 'from.id',
        'toppc.id',
        'pc.id'
    )

    const product = await query

    if (!product) throw new Error('product_not_found')
    let product_source = false
    if (options.product_source) {
        product_source = true
    }

    let [variations, product_images] = await Promise.all([
        ProductVariation.getProductVariationsByProductId(id, variation_opt),
        ProductImage.getProductImagesByProductId(id),
    ])

    const allData = variations.map(async (item) => {
        let promotionData = await knex
            .select([
                'prt.*',
                'pr.product_id',
                'pr.variation_id',
                'pv.origin_supplier_price',
                knex.raw(`row_to_json(pr.*) as promotion_product`),
            ])
            .first()
            .from('promotion as prt')
            .innerJoin('promotion_product as pr', 'prt.id', 'pr.promotion_id')
            .innerJoin('product as p', 'pr.product_id', 'p.id')
            .innerJoin('product_variation as pv', 'pr.variation_id', 'pv.id')
            .where('pr.variation_id', item.id)
            .andWhere({ 'prt.is_deleted': false })
            .andWhere({ 'p.is_promotion': true })
            .andWhere({ 'pv.is_promotion': true })
            .andWhere({ 'prt.is_approve': true })
            .andWhere({ 'prt.status_validate': 'active' })
            .andWhere({ 'pr.status': 'active' })
            .groupBy('prt.id', 'pr.id', 'pv.id', 'p.id')

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
            item.promotion.options = options
        }

        return item
    })

    variations = await Promise.all(allData)

    const redisKey = `product_detail_${id}`
    const numberOfVisits = await redisClient.getValue(redisKey)
    if (!numberOfVisits) await redisClient.set(redisKey, 1)
    redisClient.incrementValue(redisKey)

    return {
        ...product,
        number_of_visits: numberOfVisits * 1 || 1,
        variations,
        product_images,
        is_source: product_source,
    }
}

exports.getProductDetailOnly = async (id, options = {}) => {
    const condition = { 'product.is_deleted': false }
    if (options.partner_id) condition['product.partner_id'] = options.partner_id
    if (options.status) condition['product.status'] = options.status
    if (options.publish_status)
        condition['product.publish_status'] = options.publish_status

    const [product, variations, product_images] = await Promise.all([
        knex
            .select(['product.*'])
            .from('product')
            .first()
            .where(condition)
            .andWhere('product.id', id)
            .groupBy('product.id'),
        ProductVariation.getProductVariationsByProductId(id),
        ProductImage.getProductImagesIncludeThumbByProductId(id),
    ])

    return { ...product, product_images, variations }
}

exports.getProductsLimit = ({ limit, offset }) =>
    knex.select().from('product').limit(limit).offset(offset)

exports.countProduct = () =>
    knex
        .first()
        .count('id')
        .from('product')
        .where({ status: 'pending_for_review' })

exports.countImportProduct = (partner_id) =>
    knex
        .first()
        .count('id')
        .from('store_product')
        .where({ partner_id, is_deleted: false })

exports.countProductOnSale = (partner_id) =>
    knex
        .first()
        .count('id')
        .from('store_product')
        .where({
            partner_id,
            is_deleted: false,
            platform: 'lazada' || 'shoppe',
        })
        .whereNotNull('shop_product_id')

exports.countProductFromWareHousingId = (id) =>
    knex
        .first()
        .count('id')
        .from('product')
        .where({ supplier_warehousing_id: id, is_deleted: false })

exports.countInactiveProductFromWareHousingId = (id) =>
    knex.first().count('id').from('product').where({
        supplier_warehousing_id: id,
        is_deleted: false,
        status: 'active',
    })

exports.decrementQtyProduct = (product_id, total, { trx } = {}) =>
    getKnex('product', trx)
        .decrement('total_quantity', total)
        .where('id', product_id)

exports.increateFieldsForProducts = (productIds, field, { trx } = {}) =>
    getKnex('product', trx).increment(field, 1).whereIn('id', productIds)

exports.increateProduct = (productId, { trx } = {}, field) =>
    getKnex('product', trx).increment(field, 1).where('id', productId)

exports.increateNumberOfImport = (productId, { trx } = {}) =>
    exports.increateProduct(productId, { trx }, 'number_of_import')

exports.increateNumberOfPushed = (productId, { trx } = {}) =>
    exports.increateProduct(productId, { trx }, 'number_of_times_pushed')

exports.increateNumberOfBooking = (productId, { trx } = {}) =>
    exports.increateProduct(productId, { trx }, 'number_of_booking')

exports.countInfoProductByPartnerId = async (options, whereCondition) => {
    const query = knex
        .select([
            'publish_status',
            knex.raw(
                `count(1)                                         AS count`
            ),
        ])
        .from('product')
    const condition = {}

    if (options.partner_id) condition.partner_id = options.partner_id
    query.where(condition)
    if (whereCondition?.from_time) {
        query.andWhere('created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('created_at', '<=', whereCondition.to_time)

    query.groupBy('publish_status')

    return query
}
exports.cloneProduct = async (id) => {
    await knex.raw(`call public.clone_supplier_product(${id})`)
}

exports.getProductStockListing = async (options = {}, whereCondition) => {
    const selectArr = [
        'p.id',
        ...exports.LIST_COLS,
        'p.status',
        getBasicSup(),
        knex.raw('row_to_json("pc".*) as product_category'),
        knex.raw('row_to_json("toppc".*) as top_category'),
        knex.raw(
            '(select case when min(product_variation.total_quantity) <= 0 then 0 when min(product_variation.total_quantity - product_variation.low_quantity_thres) <= 0 then 1 else 2 end as variation_quantity_type from product_variation where product_id = p.id) as variation_quantity_type'
        ),
        knex.raw(
            '(select case when p.total_quantity <= 0 then 0 when p.total_quantity <= p.low_quantity_thres then 1 else 2 end) as quantity_type'
        ),
    ]

    // Counter for supplier product list
    const counterQuery = knex
        .first()
        .count('p.id')
        .from('product as p')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
    const query = knex
        .select(selectArr)
        .from('product as p')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')
        .leftJoin('product_source as ps', 'p.product_source_id', 'ps.id')

    const condition = {
        'p.is_deleted': false,
        's.is_deleted': false,
    }
    if (options.status) {
        condition['p.status'] = options.status
    }

    if (options.tenant_id) condition['p.tenant_id'] = options.tenant_id
    else condition['p.tenant_id'] = null

    if (options.partner_id && !options.product_source_ids) {
        condition['p.partner_id'] = options.partner_id
    }

    if (options.supplier_id && !options.product_source_ids) {
        condition['p.supplier_id'] = options.supplier_id
    }
    if (options.publish_status) {
        condition['p.publish_status'] = options.publish_status
    }

    if (options.product_source_ids) {
        query.whereIn('p.product_source_id', options.product_source_ids)
        counterQuery.whereIn('p.product_source_id', options.product_source_ids)
    }

    query.where(condition)

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder
                    .where('p.name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'toppc.name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
            counterQuery.andWhere((builder) => {
                builder
                    .where('p.name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'toppc.name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }

        if (whereCondition.supplier_id) {
            query.andWhere('p.supplier_id', whereCondition.supplier_id)
        }

        if (whereCondition.status) {
            query.andWhere('p.status', whereCondition.status)
        }
        if (whereCondition.publish_status) {
            query.andWhere('p.publish_status', whereCondition.publish_status)
        }

        if (
            whereCondition?.has_variation === false ||
            whereCondition?.has_variation === true
        )
            query.andWhere('p.has_variation', whereCondition.has_variation)

        if (!_.isEmpty(whereCondition.filter_quantity)) {
            query.andWhere((builder) => {
                for (const rangeValue of whereCondition.filter_quantity) {
                    builder.orWhere((builder2) => {
                        builder2.andWhere(
                            'total_quantity',
                            '>=',
                            rangeValue.from
                        )
                        if (rangeValue.to)
                            builder2.andWhere(
                                'total_quantity',
                                '<=',
                                rangeValue.to
                            )

                        return builder2
                    })
                }

                return builder
            })
        }

        if (!_.isEmpty(whereCondition.filter_times_pushed)) {
            query.andWhere((builder) => {
                for (const rangeValue of whereCondition.filter_times_pushed) {
                    builder.orWhere((builder2) => {
                        builder2.andWhere(
                            'p.number_of_times_pushed',
                            '>=',
                            rangeValue.from
                        )
                        if (rangeValue.to)
                            builder2.andWhere(
                                'p.number_of_times_pushed',
                                '<=',
                                rangeValue.to
                            )

                        return builder2
                    })
                }

                return builder
            })
        }
    }

    if (!options.partner_id && options.is_admin_listing) {
        query.andWhere((builder) => {
            for (const rangeValue of STATUS_ITEM)
                builder.orWhere((builder2) => {
                    builder2
                        .andWhere('p.status', '=', rangeValue)
                        .andWhere('p.publish_status', '!=', STATUS.INACTIVE)

                    return builder2
                })

            return builder
        })
    }
    // Filter by quantity type
    if (whereCondition.quantity) {
        query.andWhere((builder) => {
            if (whereCondition.quantity === 'low') {
                builder
                    .whereRaw(
                        'p.has_variation = false and p.total_quantity > 0 and p.total_quantity <= p.low_quantity_thres'
                    )
                    .orWhereRaw(
                        'p.has_variation = true and (select count(1) from product_variation pv where pv.product_id = p.id and pv.is_deleted = false and pv.total_quantity > 0 and pv.total_quantity <= pv.low_quantity_thres) > 0'
                    )
            } else if (whereCondition.quantity === 'zero') {
                builder
                    .whereRaw(
                        'p.has_variation = false and p.total_quantity <= 0 '
                    )
                    .orWhereRaw(
                        'p.has_variation = true and (select count(1) from product_variation pv where pv.product_id = p.id and pv.is_deleted = false and pv.total_quantity <= 0 ) > 0'
                    )
            }

            return builder
        })
    }

    query.groupBy(
        'p.id',
        's.id',
        'pc.id',
        'toppc.id',
        'ps.id'
    )

    const sortCondition = {
        by: 'p.id',
        direction: options.order_direction,
    }
    if (options.order_by === 'updated_at') {
        sortCondition.by = 'p.updated_at'
    }
    if (options.order_by === 'created_at') {
        sortCondition.by = 'p.created_at'
    }

    if (options.order_by === 'rating') {
        sortCondition.by = 'p.rating'
    }
    if (options.order_by === 'price') {
        sortCondition.by = 'p.min_price_variation'
    }
    if (options.order_by === 'number_of_times_pushed') {
        sortCondition.by = 'p.number_of_times_pushed'
    }

    const result = await query
        .orderByRaw(
            `${sortCondition.by} ${sortCondition.direction}`
        )
        .paginate(options.paginate)

    let data
    try {
        data = mappingProductDiscount(result.data)
    } catch (e) {
        Logger.error(`[getProductListingV2] error when get`, e)
        data = result.data
    }
    // Get summary information
    const summary = []
    for (let indx = 0; indx < PRODUCT_STATUS_ARR.length; indx += 1) {
        const mapItem = PRODUCT_STATUS_MAP[PRODUCT_STATUS_ARR[indx]]
        if (mapItem) {
            if (
                mapItem.status === options.status &&
                mapItem.publish_status === options.publish_status
            ) {
                summary.push({
                    state: PRODUCT_STATUS_ARR[indx],
                    record_cnt: result.pagination.total,
                })
            } else {
                if (mapItem.status) condition['p.status'] = mapItem.status
                else delete condition['p.status']
                if (mapItem.publish_status)
                    condition['p.publish_status'] = mapItem.publish_status
                else delete condition['p.publish_status']
                const cloneSummary = counterQuery.clone()
                const resultCnt = await cloneSummary.andWhere(condition)
                summary.push({
                    state: PRODUCT_STATUS_ARR[indx],
                    record_cnt: resultCnt.count,
                })
            }
        }
    }
    if (options?.include_variation) {
        const productIds = data.map((item) => item.id)
        let variationData = await knex
            .select(['product_variation.*'])
            .from('product_variation')
            .whereIn('product_id', productIds)
            .andWhere({ 'product_variation.is_deleted': false })
            .orderBy('product_variation.id', 'desc')
        variationData = variationData.map((item) => {

            delete item.total_quantity

            return {
                ...item,
            }
        })

        data = data.map((product) => ({
            ...product,
            variations: variationData.filter(
                (t) => t.product_id === product.id
            ),
        }))
    }

    // Check low quantiy product
    data = data.map((pro) => ({
        ...pro,
        low_quantity_warn:
            (pro.has_variation && pro.variation_quantity_type === 1) ||
            (!pro.has_variation && pro.quantity_type === 1),
        zero_quantity_warn:
            (pro.has_variation && pro.variation_quantity_type === 0) ||
            (!pro.has_variation && pro.quantity_type === 0),
    }))

    return {
        summary,
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data,
    }
}

exports.getProductStockDetail = async (id, options = {}, variation_opt = {}) => {
    const selectArr = [
        'pst.id',
        'p.id as product_id',
        ...exports.LIST_COLS,
        'p.description',
        'p.product_categories_metadata',
        'p.attributes',
        'pst.total_quantity',
        'pst.status',
        knex.raw('row_to_json("from".*) as from_location'),
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        knex.raw('row_to_json("swret".*) as supplier_warehouse_return'),
        getBasicSupWithSetting(),
        knex.raw('row_to_json("toppc".*) as top_category'),
        knex.raw('row_to_json("pc".*) as product_category'),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('product_stock as pst')
        .innerJoin('product as p', 'pst.product_id', 'p.id')
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'pst.supplier_warehousing_id',
            'sw.id'
        )
        .leftJoin(
            'supplier_warehousing as swret',
            'pst.supplier_warehouse_return_id',
            'swret.id'
        )
        .innerJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')

    const condition = {
        'pst.id': id,
        'pst.is_deleted': false,
        'p.is_deleted': false,
        's.is_deleted': false,
    }

    if (options.status) {
        condition['pst.status'] = options.status
    }

    if (options.partner_id) {
        condition['p.partner_id'] = options.partner_id
    }

    query.where(condition)

    query = query.groupBy(
        'pst.id',
        'p.id',
        's.id',
        'sw.id',
        'swret.id',
        'from.id',
        'toppc.id',
        'pc.id'
    )

    const product = await query

    if (!product) throw new Error('product_not_found')
    let product_source = false
    if (options.product_source) {
        product_source = true
    }

    let [variations, product_images] = await Promise.all([
        ProductStockVariation.getProductVariationsByProductStockId(id, variation_opt),
        ProductImage.getProductImagesByProductStockId(id),
    ])

    const redisKey = `product_stock_detail_${id}`
    const numberOfVisits = await redisClient.getValue(redisKey)
    if (!numberOfVisits) await redisClient.set(redisKey, 1)
    redisClient.incrementValue(redisKey)

    return {
        ...product,
        number_of_visits: numberOfVisits * 1 || 1,
        variations,
        product_images,
        is_source: product_source,
    }
}

exports.getProductStockDetailOnly = async (id, options = {}) => {
    const condition = { 'pst.is_deleted': false }
    if (options.status) condition['p.status'] = options.status
    if (options.publish_status)
        condition['p.publish_status'] = options.publish_status

    const [product, variations, product_images] = await Promise.all([
        knex
            .select([
                'pst.id',
                'p.id as product_id',
                ...exports.LIST_COLS,
                'p.description',
                'p.product_categories_metadata',
                'p.attributes',
                'p.top_category',
                'pst.total_quantity',
                'pst.status',
            ])
            .first()
            .from('product_stock as pst')
            .innerJoin('product as p', 'pst.product_id', 'p.id')
            .where(condition)
            .andWhere('pst.id', id)
            .groupBy('pst.id', 'p.id'),
        ProductStockVariation.getProductVariationsByProductStockId(id),
        ProductImage.getProductImagesIncludeThumbByProductStockId(id),
    ])

    return { ...product, product_images, variations }
}