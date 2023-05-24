const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getLocations = async (options = {}, whereCondition) => {
    let query = knex.select().from('location')
    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('province', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'province_code',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere('country', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere('address1', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere('address2', 'ilike', `%${whereCondition.keyword}%`)
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere('id', parseInt(whereCondition.keyword, 10))

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

exports.insertLocation = (data, { trx } = {}) =>
    getKnex('location', trx).returning('id').insert(data)

exports.updateLocation = (condition, data) =>
    knex('location').update(data).where(condition)

exports.updateLocationById = (id, data, { trx } = {}) =>
    exports.updateLocation({ id }, data, { trx })

exports.getLocation = (condition) =>
    knex.first().from('location').where(condition)

exports.getLocationById = (id) => exports.getLocation({ id })

exports.deleteLocation = (condition) => knex('location').where(condition).del()

exports.deleteLocationById = (id) => exports.deleteLocation({ id })

// TODO hieu: Sửa đám này nếu có keywork mới where like
exports.getProvinces = async (keyword, parent_id) => {
    let query = knex
        .select('*')
        .from('location_province')
        .andWhere('country_id', parent_id)
    if (keyword) {
        // eslint-disable-next-line no-unused-vars
        query = query.where((builder) => {
            builder.where('search_txt', 'ilike', `%${keyword}%`)

            return builder
        })
    }
    const result = await query.orderBy('priority', 'asc')

    return {
        data: result,
    }
}

exports.getDistrictByCityID = async (keyword, id) => {
    let query = knex
        .select('*')
        .from('location_district')
        .andWhere('province_id', id)
    if (keyword) {
        // eslint-disable-next-line no-unused-vars
        query = query.where((builder) => {
            builder.where('search_txt', 'ilike', `%${keyword}%`)

            return builder
        })
    }
    const result = await query.orderBy('priority', 'asc')

    return {
        data: result,
    }
}

exports.getWardByDistrictID = async (keyword, id) => {
    let query = knex
        .select('*')
        .from('location_ward')
        .andWhere('district_id_int', id)
    if (keyword) {
        // eslint-disable-next-line no-unused-vars
        query = query.where((builder) => {
            builder.where('search_txt', 'ilike', `%${keyword}%`)

            return builder
        })
    }
    const result = await query.orderBy('priority', 'asc')

    return {
        data: result,
    }
}

exports.getCountries = async (keyword) => {
    let query = knex.select('*').from('location_country')
    if (keyword) {
        // eslint-disable-next-line no-unused-vars
        query = query.where((builder) => {
            builder.where('name', 'ilike', `%${keyword}%`)

            return builder
        })
    }
    const result = await query.orderBy('id', 'asc')

    return {
        data: result,
    }
}
