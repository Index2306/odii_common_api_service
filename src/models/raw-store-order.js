const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { removeEmpty } = require('../utils/common.util')

exports.insert = (data, { trx } = {}) =>
    getKnex('raw_store_order', trx).returning('id').insert(data)

exports.upsert = (data, { trx } = {}) =>
    getKnex('raw_store_order', trx)
        .insert(data)
        .onConflict(['store_id', 'code'])
        .merge()

        .returning('*')

exports.update = (condition, data, { trx } = {}) =>
    getKnex('raw_store_order', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.getMany = (condition) =>
    knex.select().from('raw_store_order').where(condition)

exports.getOne = (condition) =>
    knex.first().from('raw_store_order').where(condition)

exports.getById = (id) => exports.getOne({ id })

exports.getListing = async (options = {}, whereCondition) => {
    let query = knex
        .select('rso. *', knex.raw('row_to_json("store".*) as store'))
        .from('raw_store_order as rso')
        .leftJoin('store', 'store.id', 'rso.store_id')

    if (options.partner_id) {
        query.andWhere('rso.partner_id', options.partner_id)
    }

    if (whereCondition.store_id) {
        query.andWhere('rso.store_id', whereCondition.store_id)
    }

    if (whereCondition.platform) {
        query.andWhere('rso.platform', whereCondition.platform)
    }

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder.where(
                    'rso.code',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere('id', parseInt(whereCondition.keyword, 10))

                return builder
            })
        }
    }

    query = query.groupBy('rso.id', 'store.id')

    const result = await query
        .orderBy(options.order_by || 'rso.id', options.order_direction)
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

exports.getOrderRawDetailById = (id, options = {}) => {
    const query = knex
        .select('rso. *', knex.raw('row_to_json("store".*) as store'))
        .first()
        .from('raw_store_order as rso')
        .where('rso.id', id)
        .leftJoin('store', 'store.id', 'rso.store_id')

    if (options.partner_id) {
        query.andWhere('rso.partner_id', options.partner_id)
    }

    return query
}
