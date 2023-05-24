const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const StoreProductVariation = require('./store-product-variation')
const StoreProductImage = require('./store-product-image')
const { STORE_PRODUCT_PUBLISH_STATUS } = require('../constants')
const {
    removeEmpty,
    normalLocaltion,
    getLocationFullAddress,
} = require('../utils/common.util')
const { getBasicSup, getBasicStore } = require('./model-helper')
const { default: logger } = require('../logger')
const { mappingProductDiscount } = require('../services/product')

exports.LIST_COLS = [
    'id',
    'name',
    'sku',
    'store_id',
    'product_id',
    'partner_id',
    'barcode',
    'status',
    'is_deleted',
    'thumb',
    'size_chart',
    'currency_code',
    'retail_price',
    'retail_price_compare_at',
    'origin_price',
    'vendor',
    'option_1',
    'option_2',
    'option_3',
    'created_at',
    'updated_at',
    'shop_product_id',
    'platform',
    'attributes',
    'primary_cat_id',
    'has_variation',
    'number_of_variation',
    'min_price_variation',
    'max_price_variation',
    'quantity',
    'tags',
    'top_category',
    'product_category_id',
    'publish_status',
    'primary_cat_id',
    'primary_cat_metadata',
    'platform_extra_attributes',
    'platform_status',
    'platform_status_name',
    'platform_reject_reason',
    'odii_status_id',
    'odii_status_name',
]

exports.FULL_FIELDS = ['description', 'short_description', ...exports.LIST_COLS]

const COLUMNS = exports.LIST_COLS.map((item) => `p.${item}`)

exports.reformat = (body) => removeEmpty(_.pick(body, exports.FULL_FIELDS))

exports.insert = (data, { trx } = {}) =>
    getKnex('store_product', trx).returning('id').insert(data)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('store_product', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.delete = (condition, { trx } = {}) =>
    getKnex('store_product', trx).where(condition).del()

exports.getMany = (condition) =>
    knex.select().from('store_product').where(condition)

exports.getOne = (condition) =>
    knex.first().from('store_product').where(condition)

exports.getById = (id) => exports.getOne({ id })

exports.getListing = async (options = {}, whereCondition) => {
    const selectArr = [
        ...COLUMNS,
        knex.raw('sp.min_price_variation as origin_supplier_price'),
        knex.raw('pc.store_cat_id as lazada_cat_id'),
        knex.raw('row_to_json("pc".*) as product_category'),
        knex.raw('row_to_json("toppc".*) as top_category'),
        knex.raw(
            `json_build_object('id', sw.id, 'location_id', sw.location_id, 'name', sw.name) as supplier_warehousing`
        ),
        // knex.raw('row_to_json("st".*) as store'),
        getBasicStore('st', 'store'),
        knex.raw('pst.status as supplier_product_status'),
        knex.raw('sp.publish_status as supplier_product_publish_status'),
        knex.raw('pst.total_quantity as supplier_product_total_quantity'),
    ]

    let query = knex
        .select(selectArr)
        .from('store_product as p')
        .innerJoin('product as pr', 'p.product_id', 'pr.id')
        .joinRaw(`LEFT JOIN product as sp ON p.product_id = sp.id`)
        .joinRaw(`LEFT JOIN product_stock as pst ON p.product_stock_id = pst.id`)
        .innerJoin(
            'supplier_warehousing as sw',
            'pst.supplier_warehousing_id',
            'sw.id'
        )
        .joinRaw(`LEFT JOIN store as st ON p.store_id = st.id`)
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')

    if (whereCondition.is_import_list) {
        query = knex
            .select(selectArr)
            .from('store_product as p')
            .leftJoin('product as pr', 'p.product_id', 'pr.id')
            .joinRaw(`LEFT JOIN product as sp ON p.product_id = sp.id`)
            .joinRaw(`LEFT JOIN product_stock as pst ON p.product_stock_id = pst.id`)
            .leftJoin(
                'supplier_warehousing as sw',
                'pst.supplier_warehousing_id',
                'sw.id'
            )
            .joinRaw(`LEFT JOIN store as st ON p.store_id = st.id`)
            .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
            .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')
    }

    query.where({
        'p.is_deleted': false,
    })
    // .andWhereRaw(
    //     'st.id is null or st.is_deleted = false'
    //  )

    if (whereCondition.status) {
        query.andWhere({
            'p.status': whereCondition.status,
        })
    }

    if (options.publish_status) {
        query.andWhere({
            'p.publish_status': options.publish_status,
        })
    }

    if (whereCondition.publish_status) {
        query.andWhere({
            'p.publish_status': whereCondition.publish_status,
        })
    }

    if (options.partner_id) {
        query.andWhere('p.partner_id', options.partner_id)
    }

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.is_import_list === true) {
            query
                .whereNot(
                    'p.publish_status',
                    STORE_PRODUCT_PUBLISH_STATUS.ACTIVE
                )
                .andWhere((builder) => {
                    builder.orWhereNull('st.id')

                    builder.orWhere({
                        'st.is_deleted': false,
                    })
                })
        }

        if (whereCondition.is_selling === true) {
            query
                .whereIn('p.publish_status', [
                    STORE_PRODUCT_PUBLISH_STATUS.ACTIVE,
                    STORE_PRODUCT_PUBLISH_STATUS.DELETE,
                    STORE_PRODUCT_PUBLISH_STATUS.DEACTIVE,
                    STORE_PRODUCT_PUBLISH_STATUS.READY,
                ])
                .andWhere({
                    'st.is_deleted': false,
                })
        }

        if (whereCondition.is_not_selling === true) {
            query.where(
                'p.publish_status',
                STORE_PRODUCT_PUBLISH_STATUS.INACTIVE
            )
        }

        // if (whereCondition.store_id) {
        //     query.andWhere('p.store_id', whereCondition.store_id)
        // }

        // if (whereCondition.platform) {
        //     query.andWhere('p.platform', whereCondition.platform)
        // }

        if (!_.isEmpty(whereCondition.storeIdList)) {
            query.whereIn('p.store_id', whereCondition.storeIdList)
        }

        if (!_.isEmpty(whereCondition.platformList)) {
            query.whereIn('p.platform', whereCondition.platformList)
        }

        if (!_.isEmpty(whereCondition.statusList)) {
            query.andWhere((builder) => {
                builder.whereIn('p.odii_status_id', whereCondition.statusList)

                if (whereCondition.statusList.includes('0')) {
                    builder.orWhereNull('p.odii_status_id')
                }
            })
        }

        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder.where('p.name', 'ilike', `%${whereCondition.keyword}%`)

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }

        // if (whereCondition.status) {
        //     query.andWhere('p.status', whereCondition.status)
        // }

        if (whereCondition?.from_rating)
            query.andWhere('p.rating', '>=', whereCondition.from_rating)

        if (whereCondition?.to_rating)
            query.andWhere('p.rating', '<=', whereCondition.to_rating)

        if (whereCondition?.ware_house)
            query.andWhere('sw.id', '=', whereCondition.ware_house)

        if (
            whereCondition?.has_variation === false ||
            whereCondition?.has_variation === true
        )
            query.andWhere('p.has_variation', whereCondition.has_variation)
    }

    query = query.groupBy(
        'p.id',
        'sp.id',
        'pst.id',
        'pc.id',
        'toppc.id',
        'st.id',
        'sw.id'
    )
    // console.log(query.toString())
    const result = await query
        .orderBy(options.order_by || 'p.id', options.order_direction)
        .paginate(options.paginate)

    let data
    try {
        data = mappingProductDiscount(result.data)
    } catch (e) {
        logger.error(`[getProductListingV2] error when get`, e)
        data = result.data
    }

    if (options?.include_variation) {
        const productIds = data.map((item) => item.id)
        let variationData = await knex
            .select(['store_product_variation.*'])
            .from('store_product_variation')
            .whereIn('store_product_variation.store_product_id', productIds)
            .andWhere({ 'store_product_variation.is_deleted': false })
            .orderBy('store_product_variation.id', 'desc')

        const allDatas = variationData.map(async (item) => {
            const promotionData = await knex
                .select([
                    'prt.*',
                    'pr.product_id',
                    'pr.variation_id',
                    knex.raw(`row_to_json(pr.*) as promotion_product`),
                ])
                .first()
                .from('promotion as prt')
                .innerJoin(
                    'promotion_product as pr',
                    'prt.id',
                    'pr.promotion_id'
                )
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
                        promotion_product_id:
                            promotionData.promotion_product.id,
                    })
                    .orderBy('promotion_product_option.id', 'asc')
            }
            item.promotion = promotionData || {}
            if (!_.isEmpty(options)) {
                item.promotion.value = options[0].value
            }

            return item
        })

        variationData = await Promise.all(allDatas)

        data = data.map((product) => ({
            ...product,
            product_variation: variationData.filter(
                (t) => t.store_product_id === product.id
            ),
        }))
    }

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data,
    }
}

exports.getStoreProductDetailOnly = async (id, options = {}) => {
    const condition = { 'store_product.is_deleted': false }
    if (options.partner_id)
        condition['store_product.partner_id'] = options.partner_id
    if (options.status) condition['store_product.status'] = options.status

    const variationCondition = {}
    if (options.variation_status)
        variationCondition.status = options.variation_status

    const checkProduct = await exports.getById(id)

    if (!checkProduct.product_id) {
        let [product, variations, store_product_images] = await Promise.all([
            knex
                .select([
                    'store_product.*',
                ])
                .from('store_product')
                .first()
                .where(condition)
                .andWhere('store_product.id', id),
            StoreProductVariation.getManyByStoreProductId(id, variationCondition),
            StoreProductImage.getManyByProductId(id),
        ])

        return {
            ...product,
            store_product_images,
            variations
        }
    }


    // product_categories_metadata
    // eslint-disable-next-line camelcase, prefer-const
    let [product, variations, store_product_images] = await Promise.all([
        knex
            .select([
                'store_product.*',
                'pst.total_quantity as total_quantity',
                'p.low_retail_price as low_retail_price',
                knex.raw('row_to_json("toppc".*) as top_category'),
                knex.raw('row_to_json("odii_cat".*) as odii_cat'),
                'p.product_categories_metadata as lazada_product_categories_metadata',
                'p.attributes as lazada_attributes',
                'p.name as origin_product_name',
                'p.product_category_id as product_category_id',
                knex.raw('row_to_json("sw".*) as supplier_warehousing'),
                knex.raw(
                    'row_to_json("swret".*) as supplier_warehousing_return'
                ),
                knex.raw('row_to_json("from".*) as from_location'),
                knex.raw('row_to_json("returnLoc".*) as return_location'),
                getBasicSup(),
                getBasicStore(),
            ])
            .from('store_product')
            .leftJoin('product as p', 'store_product.product_id', 'p.id')
            .leftJoin('product_stock as pst', 'store_product.product_stock_id', 'pst.id')
            .leftJoin(
                'product_category as toppc',
                'store_product.top_category',
                'toppc.id'
            )
            .leftJoin(
                'product_category as odii_cat',
                'p.product_category_id',
                'odii_cat.id'
            )
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
            .leftJoin(
                'location as returnLoc',
                'swret.location_id',
                'returnLoc.id'
            )
            .leftJoin('store', 'store_product.store_id', 'store.id')
            .first()
            .where(condition)
            .andWhere('store_product.id', id)
            .groupBy(
                'store_product.id',
                'p.id',
                'pst.id',
                's.id',
                'sw.id',
                'swret.id',
                'from.id',
                'returnLoc.id',
                'toppc.id',
                'odii_cat.id',
                'store.id'
            ),
        StoreProductVariation.getManyByProductId(id, variationCondition),
        StoreProductImage.getManyByProductId(id),
    ])

    if (!product) throw new Error('product_not_found')

    if (product.from_location) {
        product.normal_address = normalLocaltion(product.from_location)
        product.full_address = getLocationFullAddress(product.from_location)
    }
    if (product.return_location) {
        product.normal_address_ret = normalLocaltion(product.return_location)
        product.full_address_ret = getLocationFullAddress(
            product.return_location
        )
    }

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

    return {
        ...product,
        store_product_images,
        variations,
        lazada_cat_id: product?.odii_cat?.store_cat_id,
    }
}

exports.sellerGetWareHouse = async (options = {}) => {
    const query = knex
        .select([
            'sw.id',
            'su.name as supplier_name',
            'sw.name as ware_house_name',
            'loc.address1 as address',
            'loc.ward_name',
            'loc.district_name',
            'loc.province as province_name',
        ])
        .from('supplier as su')
        .leftJoin('supplier_warehousing as sw', 'su.id', 'sw.supplier_id')
        .innerJoin('location as loc', 'sw.location_id', 'loc.id')
        .whereNotNull('sw.id')

    query.where({
        'su.is_deleted': false,
        'su.status': 'active',
    })

    if (options.tenant_id) {
        query.andWhere('su.tenant_id', options.tenant_id)
    }

    const result = await query

    return {
        data: result,
    }
}
