const _ = require('lodash')
const moment = require('moment')
const { knex, getKnex } = require('../connections/pg-general')

exports.getProductSources = async (options = {}, whereCondition) => {
    let query = knex
        .select('product_source.*', 'user.email')
        .from('product_source')
        .leftJoin('user', 'product_source.user_id', 'user.id')
        .where('product_source.is_deleted', false)
        .groupBy('product_source.id', 'user.id')
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'search_text',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                return builder
            })
        }
    }
    if (options.tenant_id)
        query = query.andWhere('user.tenant_id', options.tenant_id)

    if (options?.supplier_id) {
        query = query.andWhere('supplier_id', options.supplier_id)
    }
    const result = await query
        .orderBy(
            options.order_by || 'product_source.id',
            options.order_direction
        )
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

exports.insertProductSource = (data, { trx } = {}) =>
    getKnex('product_source', trx).returning('id').insert(data)

exports.updateProductSource = (condition, data) =>
    knex('product_source').update(data).where(condition)

exports.updateProductSourceById = (id, data, { trx } = {}) =>
    exports.updateProductSource({ id }, data, trx)

exports.getProductSource = (condition) =>
    knex.first().from('product_source').where(condition)

exports.getPrtSources = (condition) =>
    knex.from('product_source').where(condition)

exports.getSupProductSourceById = (id, options = {}) => {
    let query = knex
        .select('product_source.*')
        .first()
        .from('product_source')
        .where('is_deleted', false)
        .andWhere('product_source.id', id)
        .groupBy('product_source.id')

    if (options.supplier_id) {
        query = query.where('product_source.supplier_id', options.supplier_id)
    }

    return query
}

exports.checkExisted = (id, condition) =>
    knex
        .first()
        .from('product_source')
        .where('id', '!=', id)
        .andWhere(condition)

exports.getProductSourceById = (id) => exports.getProductSource({ id })

exports.getProductSourceByIds = (ids) =>
    knex.from('product_source').whereIn('id', ids)

exports.deleteProductSource = (userId, condition) =>
    knex('product_source')
        .update({ is_deleted: true, updated_at: moment(), updated_by: userId })
        .where(condition)
