const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { getBasicUser } = require('./model-helper')

exports.getDiscounts = async (options = {}, whereCondition) => {
    let query = knex
        .select('discount.*', getBasicUser('u', 'from_user'))
        .from('discount')
        .leftJoin('partner', 'partner.id', 'discount.partner_id')
        .leftJoin('user as u', 'u.id', 'partner.user_id')
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where(
                    'discount.name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                return builder
            })
        }
    }
    const condition = {}

    if (options.partner_id) condition.partner_id = options.partner_id
    if (whereCondition.partner_id)
        condition.partner_id = whereCondition.partner_id
    if (whereCondition.apply_for) condition.apply_for = whereCondition.apply_for

    query.andWhere(condition)

    const result = await query
        .orderBy(options.order_by || 'discount.id', options.order_direction)
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

exports.insertDiscount = (data, { trx } = {}) =>
    knex('discount', trx).insert(data).returning('id')

exports.insertProductDiscount = (data, { trx } = {}) =>
    knex('product_discount', trx).insert(data).returning('id')

exports.getDiscount = (condition) =>
    knex.first().from('discount').where(condition)

exports.getDiscountById = (id) => exports.getDiscount({ id })

exports.updateDiscount = (condition, data) =>
    knex('discount').update(data).where(condition)

exports.updateDiscountById = (id, data, { trx } = {}) =>
    exports.updateDiscount({ id }, data, trx)
