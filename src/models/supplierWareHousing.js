const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getSupplierWareHousings = async (options = {}, whereCondition) => {
    let query = knex
        .select([
            'supplier_warehousing.*',
            knex.raw('row_to_json("location".*) as location_data'),
        ])
        .from('supplier_warehousing')
        .innerJoin(
            'location',
            'supplier_warehousing.location_id',
            'location.id'
        )
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'supplier_warehousing.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
    }
    if (whereCondition?.supplier_id) {
        query = query.andWhere('supplier_id', whereCondition.supplier_id)
    }
    if (whereCondition?.tenant_id) {
        query = query.andWhere('tenant_id', whereCondition.tenant_id)
    }
    query.groupBy('supplier_warehousing.id', 'location.id')
    const result = await query
        .orderBy(
            options.order_by || 'supplier_warehousing.id',
            options.order_direction
        )
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

exports.insertSupplierWareHousing = (data, { trx } = {}) =>
    getKnex('supplier_warehousing', trx).returning('id').insert(data)

exports.updateSupplierWareHousing = (condition, data) =>
    knex('supplier_warehousing').update(data).where(condition)

exports.updateSupplierWareHousingById = (id, data, { trx } = {}) =>
    exports.updateSupplierWareHousing({ id }, data, trx)

exports.getSupplierWareHousing = (condition) =>
    knex.first().from('supplier_warehousing').where(condition)

exports.getAllSupplierWareHousing = (condition) =>
    knex.select().from('supplier_warehousing').where(condition)

exports.getWareHousingById = (id) => exports.getSupplierWareHousing({ id })

exports.getSupplierWareHousingById = (id, options = {}) => {
    let query = knex
        .select([
            'supplier_warehousing.*',
            knex.raw('row_to_json("location".*) as location_data'),
        ])
        .first()
        .from('supplier_warehousing')
        .andWhere('supplier_warehousing.id', id)
        .leftJoin('location', 'supplier_warehousing.location_id', 'location.id')
        .groupBy('supplier_warehousing.id', 'location.id')

    if (options.partner_id) {
        query = query.where(
            'supplier_warehousing.partner_id',
            options.partner_id
        )
    }

    return query
}

exports.deleteSupplierWareHousing = (condition) =>
    knex('supplier_warehousing').where(condition).del()

exports.deleteSupplierWareHousingById = (id) =>
    exports.deleteSupplierWareHousing({ id })

exports.sellerGetSupplierWareHousings = async (
    options = {},
    whereCondition
) => {
    let query = knex
        .select([
            'supplier_warehousing.id',
            'supplier_warehousing.name',
            'supplier_warehousing.supplier_id',
            'supplier_warehousing.is_pickup_address',
            'supplier_warehousing.is_return_address',
            knex.raw('row_to_json("location".*) as location_data'),
        ])
        .from('supplier_warehousing')
        .innerJoin(
            'location',
            'supplier_warehousing.location_id',
            'location.id'
        )
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'supplier_warehousing.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
    }
    if (options?.supplier_id) {
        query = query.andWhere('supplier_id', options.supplier_id)
    }
    if (options.tenant_id) {
        query = query.andWhere(
            'supplier_warehousing.tenant_id',
            options.tenant_id
        )
    }
    query.groupBy('supplier_warehousing.id', 'location.id')
    const result = await query
        .orderBy(
            options.order_by || 'supplier_warehousing.id',
            options.order_direction
        )
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
