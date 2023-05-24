const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getMany = async (options = {}, whereCondition) => {
    let query = knex.select().from('bank_sms')
    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('title', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        query = query.andWhere(condition)
    }
    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
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

exports.insert = (data) => knex('bank_sms').returning('id').insert(data)

exports.update = (condition, data) =>
    knex('bank_sms').update(data).where(condition)

exports.updateById = (id, data) => exports.update({ id }, data)

exports.getOne = (condition) => knex.first().from('bank_sms').where(condition)

exports.getBankById = (id) => exports.getOne({ id })
