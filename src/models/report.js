const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getReports = async (options = {}, whereCondition) => {
    let query = knex.select().from('report')
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
    }

    const result = await query
        .orderBy(options.order_by || 'report.id', options.order_direction)
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

exports.insertReport = (data) => knex('report').returning('id').insert(data)

exports.updateReport = (condition, data) =>
    knex('report').update(data).where(condition)

exports.updateReportById = (id, data) => exports.updateReport({ id }, data)

exports.getReport = (condition) => knex.first().from('report').where(condition)

exports.getReportById = (id) => exports.getReport({ id })

exports.deleteReport = (condition) => knex('report').where(condition).del()

exports.deleteReportById = (id) => exports.deleteReport({ id })
exports.getReportsByIds = (ids) => knex.from('report').whereIn('id', ids)
