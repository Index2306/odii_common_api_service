const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getCustomers = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'customer.*',
            knex.raw(
                'row_to_json("location_country".*) as location_country_data'
            ),
            knex.raw(
                'row_to_json("location_province".*) as location_province_data'
            ),
            knex.raw(
                'row_to_json("location_district".*) as location_district_data'
            )
        )
        .from('customer')
        .leftJoin(
            'location_country',
            'location_country.id',
            'customer.country_id'
        )
        .leftJoin(
            'location_province',
            'location_province.id',
            'customer.province_id'
        )
        .leftJoin(
            'location_district',
            'location_district.id',
            'customer.district_id'
        )
    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('email', 'ilike', `%${whereCondition.keyword}%`)
                builder.orWhere(
                    'phone_number',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                builder.orWhere(
                    'full_name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                builder.orWhere(
                    'address1',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                builder.orWhere(
                    'address2',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                return builder
            })
        }
    }

    const result = await query
        .orderBy(options.order_by || 'customer.id', options.order_direction)
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

exports.insert = (data, { trx } = {}) =>
    getKnex('file_library', trx).returning('id').insert(data)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('file_library', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.getMany = (condition) =>
    knex.select().from('file_library').where(condition)

exports.getOne = (condition) =>
    knex.first().from('file_library').where(condition)

exports.getById = (id) => exports.getOne({ id })

exports.getListing = async (options = {}, whereCondition) => {
    let query = knex.select().from('file_library')
    const condition = {
        is_deleted: false,
    }
    if (options.partner_id) condition.partner_id = options.partner_id
    if (options.type) condition.type = options.type
    query.where(condition)
    if (options.is_sample === true) query.whereNull('partner_id')
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        if (whereCondition.source) {
            query.where('source', whereCondition.source)
        }
    }

    const result = await query.orderBy('id', 'desc').paginate(options.paginate)

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
