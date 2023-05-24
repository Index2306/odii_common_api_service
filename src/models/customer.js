const _ = require('lodash')
const { knex } = require('../connections/pg-general')

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
        query = query.where('customer.is_deleted', false)
        query = query.andWhere('customer.partner_id', options.partner_id)

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

exports.insertCustomer = (data) => knex('customer').returning('id').insert(data)

exports.updateCustomer = (condition, data) =>
    knex('customer').update(data).where(condition)

exports.updateCustomerById = (id, data) => exports.updateCustomer({ id }, data)

exports.getCustomer = (condition) =>
    knex.first().from('customer').where(condition)

exports.getCustomerNotItself = (condition, id) =>
    knex.first().from('customer').where(condition).andWhereNot({ id })

exports.getOneById = async (id) => exports.getCustomer({ id })

exports.getCustomerById = async (id) => {
    const query = knex
        .first()
        .select([
            'customer.*',
            knex.raw(
                'row_to_json("location_country".*) as location_country_data'
            ),
            knex.raw(
                'row_to_json("location_province".*) as location_province_data'
            ),
            knex.raw(
                'row_to_json("location_district".*) as location_district_data'
            ),
        ])
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
        .where('customer.id', id)

    const result = await query.orderBy('created_at', 'desc')

    return result
}

exports.getCustomersByIds = (ids) => knex.from('customer').whereIn('id', ids)
