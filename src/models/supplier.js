const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { STATUS } = require('../constants')
const { getBasicUser } = require('./model-helper')

exports.getSuppliers = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'supplier.*',
            knex.raw('row_to_json("location".*) as location_data'),
            'user.account_type'
        )
        .from('supplier')
        .leftJoin('location', 'location.id', 'supplier.location_id')
        .leftJoin('user', 'user.id', 'supplier.user_id')

    if (options.tenant_id)
        query = query.andWhere('user.tenant_id', options.tenant_id)

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        query = query.where('supplier.is_deleted', false)
        if (whereCondition.keyword) {
            console.log(whereCondition.keyword)
            query = query.where((builder) => {
                builder
                    .where('name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'contact_email',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                builder.orWhereRaw(
                    `metadata->'user_info'->>'representative_name' ilike ? `,
                    [`%${whereCondition.keyword}%`]
                )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'supplier.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
        if (whereCondition?.status) {
            condition['supplier.status'] = whereCondition.status
        }

        if (whereCondition?.register_status) {
            condition['supplier.register_status'] =
                whereCondition.register_status
        }

        if (whereCondition?.status_in) {
            query.whereIn('supplier.status', whereCondition.status_in)
            query.where('supplier.register_status', 'active')
        }

        if (whereCondition?.category_id) {
            query.where(
                'supplier.category_ids',
                '?',
                whereCondition.category_id
            )
        }

        if (whereCondition?.province_id) {
            query.whereRaw(
                `supplier.address->>'province_id' IN ('${whereCondition.province_id}')`
            )
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

exports.insertSupplier = (data, { trx } = {}) =>
    getKnex('supplier', trx).returning('id').insert(data)

exports.updateSupplier = (condition, data, { trx } = {}) =>
    getKnex('supplier', trx).update(data).where(condition)

exports.updateSupplierById = (id, data, { trx } = {}) =>
    exports.updateSupplier({ id }, data, { trx })

exports.getSupplier = (condition) =>
    knex.first().from('supplier').where(condition)

exports.getSupplierById = (id) =>
    knex
        .select(
            'supplier.*',
            getBasicUser('user', 'from_user'),
            // knex.raw('row_to_json("user".*) as from_user'),
            // knex.raw('row_to_json("location".*) as location_data'),
            knex.raw(
                'json_agg(supplier_warehousing.*) as supplier_warehousing_data'
            )
        )
        .from('supplier')
        .first()
        .where('supplier.id', id)
        .leftJoin('user', 'user.id', 'supplier.user_id')
        // .leftJoin('location', 'location.id', 'supplier.location_id')
        .leftJoin(
            'supplier_warehousing',
            'supplier.id',
            'supplier_warehousing.supplier_id'
        )
        .groupBy('supplier.id', 'user.id')

exports.getSupplierByPartnerId = (partner_id) =>
    exports.getSupplier({ partner_id, status: STATUS.ACTIVE })

exports.getSuggestSuppliers = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'supplier.id',
            'supplier.name',
            'supplier.address'
            // knex.raw('row_to_json("location".*) as location_data')
        )
        .from('supplier')
    // .leftJoin('location', 'location.id', 'supplier.location_id')

    if (options.tenant_id) {
        query.andWhere('supplier.tenant_id', options.tenant_id)
    } 

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        query = query.where('supplier.is_deleted', false)
        if (whereCondition.keyword) {
            console.log(whereCondition.keyword)
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'supplier.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
            if (whereCondition.from_province_code) {
                query.andWhere(
                    'location.province_code',
                    whereCondition.from_province_code
                )
            }

            if (whereCondition.from_province_id) {
                query.andWhere(
                    'location.province_id',
                    whereCondition.from_province_id
                )
            }

            if (whereCondition.from_district_id) {
                query.andWhere(
                    'location.district_id',
                    whereCondition.from_district_id
                )
            }
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

exports.getInfoSuppliers = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'supplier.id',
            'supplier.name',
            'supplier.created_at',
            'supplier.logo',
            'supplier.address',
            // knex.raw('row_to_json("location".*) as location_data'),
            knex.raw(
                'json_agg(supplier_warehousing.*) as supplier_warehousing_data'
            )
        )
        .from('supplier')
        .first()
        // .leftJoin('location', 'location.id', 'supplier.location_id')
        .leftJoin(
            'supplier_warehousing',
            'supplier.id',
            'supplier_warehousing.supplier_id'
        )
        .groupBy('supplier.id')

    const condition = {}
    query = query.where('supplier.is_deleted', false)
    if (whereCondition.keyword) {
        console.log(whereCondition.keyword)
        query = query.where((builder) => {
            builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere(
                    'supplier.id',
                    parseInt(whereCondition.keyword, 10)
                )

            return builder
        })
    }
    // console.log('options', options)

    if (options.supplier_id) condition.supplier_id = options.supplier_id
    if (options.user_id) condition.user_id = options.user_id
    query = query.andWhere(condition)

    const result = await query

    return {
        data: result,
    }
}
