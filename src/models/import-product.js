const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { LIST_COLS } = require('./product')
const { getBasicSup } = require('./model-helper')

exports.insertImportProduct = (data, { trx } = {}) =>
    getKnex('import_product', trx).returning('id').insert(data)

exports.updateImportProduct = (condition, data, { trx } = {}) =>
    getKnex('import_product', trx).where(condition).update(data)

exports.updateImportProductById = (id, data, { trx } = {}) =>
    exports.updateImportProduct({ id }, data, { trx })

exports.getImportProducts = (condition) =>
    knex.select().from('import_product').where(condition)

exports.getImportProduct = (condition) =>
    knex.first().from('import_product').where(condition)

exports.getImportProductById = (id) => exports.getImportProduct({ id })

exports.getImportProductListing = async (options = {}, whereCondition) => {
    const selectArr = [
        ...LIST_COLS,
        knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        // knex.raw('row_to_json("s".*) as supplier'),
        getBasicSup(),
        knex.raw('row_to_json("from".*) as from_location'),
        knex.raw('row_to_json("pc".*) as product_category'),
        knex.raw('row_to_json("toppc".*) as top_category'),
    ]

    let query = knex
        .select(selectArr)
        .from('product as p')
        .joinRaw(
            `INNER JOIN import_product as ip ON p.id = ip.product_id AND ip.partner_id = ${options.partner_id}`
        )
        .innerJoin('supplier as s', 'p.supplier_id', 's.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'p.supplier_warehousing_id',
            'sw.id'
        )
        .innerJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('product_category as toppc', 'p.top_category', 'toppc.id')
        .leftJoin('product_category as pc', 'p.product_category_id', 'pc.id')

    if (options.partner_id) {
        query = query.andWhere('p.partner_id', options.partner_id)
    }

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.andWhere((builder) => {
                builder.where('p.name', 'ilike', `%${whereCondition.keyword}%`)

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'p.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
        if (whereCondition.from_province_code) {
            query = query.andWhere(
                'from.province_code',
                whereCondition.from_province_code
            )
        }

        // TODO: chú ý check quyền admin product
        if (whereCondition.partner_id) {
            query = query.andWhere('p.partner_id', whereCondition.partner_id)
        }

        if (!_.isEmpty(whereCondition.tag)) {
            if (_.isArray(whereCondition.tag))
                query = query.whereRaw(
                    `p.tags \\?| array[${whereCondition.tag
                        .map((item) => `'${item}'`)
                        .join(', ')}]`
                )
            else
                query = query.whereRaw(
                    `p.tags \\?| array['${whereCondition.tag}']`
                )
        }

        if (!_.isEmpty(whereCondition.category_id)) {
            if (_.isArray(whereCondition.category_id))
                query = query.whereRaw(
                    `p.product_categories_array \\?| array[${whereCondition.category_id
                        .map((item) => `'${item}'`)
                        .join(', ')}]`
                )
            else
                query = query.whereRaw(
                    `p.product_categories_array \\?| array['${whereCondition.category_id}']`
                )
        }
    }

    query = query.groupBy(
        'p.id',
        's.id',
        'sw.id',
        'from.id',
        'pc.id',
        'toppc.id'
    )

    const result = await query
        .orderBy(options.order_by || 'p.id', options.order_direction)
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
