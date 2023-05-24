const _ = require('lodash')
const { knex } = require('../connections/pg-general')
const StoreProductVariation = require('./store-product-variation')
const StoreProductImage = require('./store-product-image')
const { getBasicSup, getBasicStore } = require('./model-helper')

exports.getListing = async (options = {}, whereCondition) => {
    let query = knex
        .select('rsp. *', knex.raw('row_to_json("store".*) as store'))
        .from('raw_store_product as rsp')
        .leftJoin('store', 'store.id', 'rsp.store_id')

    if (options.status) {
        query.andWhere({
            status: options.status,
        })
    }

    if (options.publish_status) {
        query.andWhere({
            publish_status: options.publish_status,
        })
    }

    if (whereCondition.publish_status) {
        query.andWhere({
            publish_status: whereCondition.publish_status,
        })
    }

    if (options.partner_id) {
        query.andWhere('rsp.partner_id', options.partner_id)
    }

    if (whereCondition.store_id) {
        query.andWhere('rsp.store_id', whereCondition.store_id)
    }

    if (whereCondition.platform) {
        query.andWhere('rsp.platform', whereCondition.platform)
    }

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder.where(
                    'rsp.name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'rsp.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }

        if (whereCondition.status) {
            query.andWhere('rsp.status', whereCondition.status)
        }
    }

    query = query.groupBy('rsp.id', 'store.id')

    const result = await query
        .orderBy(options.order_by || 'rsp.id', options.order_direction)
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

exports.getListingV2 = async (options = {}, whereCondition) => {
    const selectColumns = [
        'rsp. *',
        knex.raw('row_to_json("store".*) as store'),
    ]

    if (!options.isNotOdii) {
        selectColumns.push(knex.raw('row_to_json("pc".*) as product_category'))
    } else {
        selectColumns.push(
            knex.raw('row_to_json("platform_ctg".*) as product_category')
        )
    }

    let query = knex
        .select(selectColumns)
        .from('raw_store_product as rsp')
        .leftJoin('store', 'store.id', 'rsp.store_id')

    if (!options.isNotOdii) {
        query
            .joinRaw(`inner JOIN product as sp ON rsp.product_id = sp.id`)
            .leftJoin(
                'product_category as pc',
                'sp.product_category_id',
                'pc.id'
            )
    } else {
        query.leftJoin(
            'platform_category_list as platform_ctg',
            'rsp.store_category',
            'platform_ctg.shop_cat_id'
        )
    }

    if (options.status) {
        query.andWhere({
            status: options.status,
        })
    }

    if (options.publish_status) {
        query.andWhere({
            publish_status: options.publish_status,
        })
    }

    if (whereCondition.publish_status) {
        query.andWhere({
            publish_status: whereCondition.publish_status,
        })
    }

    if (options.partner_id) {
        query.andWhere('rsp.partner_id', options.partner_id)
    }

    // filter products Lazada created
    if (options.isNotOdii) {
        query.andWhere('rsp.product_id', null)
    }

    if (whereCondition.store_id) {
        query.andWhere('rsp.store_id', whereCondition.store_id)
    }

    if (whereCondition.platform) {
        query.andWhere('rsp.platform', whereCondition.platform)
    }

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder.where(
                    'rsp.name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'rsp.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }

        if (whereCondition.status) {
            query.andWhere('rsp.status', whereCondition.status)
        }
    }

    if (!options.isNotOdii) {
        query = query.groupBy('rsp.id', 'store.id', 'pc.id')
    } else {
        query = query.groupBy('rsp.id', 'store.id', 'platform_ctg.id')
    }

    const result = await query
        .orderBy(options.order_by || 'rsp.id', options.order_direction)
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

exports.getStoreProductDetailOnly = async (id, options = {}) => {
    const condition = { 'store_product.is_deleted': false }
    if (options.partner_id)
        condition['store_product.partner_id'] = options.partner_id
    if (options.status) condition['store_product.status'] = options.status

    const variationCondition = {}
    if (options.variation_status)
        variationCondition.status = options.variation_status

    // product_categories_metadata
    const [product, variations, store_product_images] = await Promise.all([
        knex
            .select([
                'store_product.*',
                knex.raw('row_to_json("toppc".*) as top_category'),
                knex.raw('row_to_json("odii_cat".*) as odii_cat'),
                'p.product_categories_metadata as lazada_product_categories_metadata',
                'p.attributes as lazada_attributes',
                'p.name as origin_product_name',
                knex.raw('row_to_json("sw".*) as supplier_warehousing'),
                knex.raw('row_to_json("from".*) as from_location'),
                getBasicSup(),
                getBasicStore(),
            ])
            .from('store_product')
            .leftJoin('product as p', 'store_product.product_id', 'p.id')
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
                'p.supplier_warehousing_id',
                'sw.id'
            )
            .innerJoin('location as from', 'sw.location_id', 'from.id')
            .leftJoin('store', 'store_product.store_id', 'store.id')
            .first()
            .where(condition)
            .andWhere('store_product.id', id)
            .groupBy(
                'store_product.id',
                'p.id',
                's.id',
                'sw.id',
                'from.id',
                'toppc.id',
                'odii_cat.id',
                'store.id'
            ),
        StoreProductVariation.getManyByProductId(id, variationCondition),
        StoreProductImage.getManyByProductId(id),
    ])

    if (!product) throw new Error('product_not_found')

    return {
        ...product,
        store_product_images,
        variations,
        lazada_cat_id: product?.odii_cat?.store_cat_id,
    }
}
