const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getRoles = async (options = {}, whereCondition) => {
    let query = knex.select().from('role')
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
        .orderBy(options.order_by || 'role.id', options.order_direction)
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

exports.insertRole = (data) => knex('role').returning('id').insert(data)

exports.updateRole = (condition, data) =>
    knex('role').update(data).where(condition)

exports.updateRoleById = (id, data) => exports.updateRole({ id }, data)

exports.getRole = (condition) => knex.first().from('role').where(condition)

exports.getRoleById = (id) => exports.getRole({ id })

exports.getRolesByIds = (ids) => knex.from('role').whereIn('id', ids)
