const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getNews = async (options = {}, whereCondition) => {
    let query = knex.select().from('news')
    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('title', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
    }

    const result = await query
        .orderBy(options.order_by || 'news.id', options.order_direction)
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

exports.insertNew = (data) => knex('news').returning('id').insert(data)

exports.updateNew = (condition, data) =>
    knex('news').update(data).where(condition)

exports.updateNewById = (id, data) => exports.updateNew({ id }, data)

exports.getNew = (condition) => knex.first().from('news').where(condition)

exports.getNewById = (id) => exports.getNew({ id })
