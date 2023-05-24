const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { getBasicUser } = require('./model-helper')
const {
    normalStoreAddress,
    getStoreFullAddress,
} = require('../utils/common.util')

exports.insertStore = (data, { trx } = {}) =>
    getKnex('store', trx).returning('id').insert(data)

exports.getMany = async (condition) =>
    knex.select().from('store').where(condition)

exports.getOne = async (condition) =>
    knex.select().first().from('store').where(condition)

exports.getOneById = async (id) => exports.getOne({ id })

exports.getStore = async (id) => {
    const query = knex
        .select([
            'store.*',
            getBasicUser('user', 'from_user'),
            knex.raw('row_to_json("p_wh".*) as pickup_warehouse'),
            knex.raw('row_to_json("r_wh".*) as return_warehouse'),
        ])
        .first()
        .from('store')
        .leftJoin('partner', 'partner.id', 'store.partner_id')
        .leftJoin('user', 'user.id', 'partner.user_id')
        .leftJoin('store_warehouse as p_wh', function () {
            this.on('p_wh.store_id', '=', 'store.id').andOnIn(
                'p_wh.is_pickup_address',
                [true]
            )
        })
        .leftJoin('store_warehouse as r_wh', function () {
            this.on('r_wh.store_id', '=', 'store.id').andOnIn(
                'r_wh.is_return_address',
                [true]
            )
        })
        .where('store.is_deleted', false)
        .andWhere('store.id', id)

    return query
}

exports.getStoreListing = async (options = {}, whereCondition) => {
    const selectArr = [
        'st.*',
        knex.raw('row_to_json("p_wh".*) as pickup_warehouse'),
        knex.raw('row_to_json("r_wh".*) as return_warehouse'),
    ]
    const query = knex
        .select(selectArr)
        .from('store as st')
        .leftJoin('store_warehouse as p_wh', function () {
            this.on('p_wh.store_id', '=', 'st.id').andOnIn(
                'p_wh.is_pickup_address',
                [true]
            )
        })
        .leftJoin('store_warehouse as r_wh', function () {
            this.on('r_wh.store_id', '=', 'st.id').andOnIn(
                'r_wh.is_return_address',
                [true]
            )
        })
        .where('st.is_deleted', false)
    if (options.tenant_id) {
        query.andWhere('st.tenant_id', options.tenant_id)
    }
    const condition = {}
    if (options.partner_id) condition.partner_id = options.partner_id
    // if (options.tenant_id) condition.tenant_id = options.tenant_id
    query.andWhere(condition)
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.andWhere((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        if (whereCondition.platform) {
            query.andWhere('platform', whereCondition.platform)
        }
    }

    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
        .paginate(options.paginate)

    result.data = result.data.map((item) => {
        const ret = { ...item }
        ret.full_address = getStoreFullAddress(item.pickup_warehouse)
        ret.normal_address = normalStoreAddress(item.pickup_warehouse)

        return ret
    })

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

exports.countStoreByPartnerId = async (partner_id) => {
    const result = knex
        .first()
        .count('id')
        .from('store')
        .where({ partner_id, is_deleted: false })

    return result
}

exports.update = (condition, data) =>
    knex('store').update(data).where(condition)

exports.updateStore = (id, data) => knex('store').update(data).where('id', id)

exports.getStoresByIds = (ids) => knex.from('store').whereIn('id', ids)
