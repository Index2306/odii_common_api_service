const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.insertSupplierImportWarehouse = (data, { trx } = {}) =>
    getKnex('warehouse_import', trx).returning('id').insert(data)

exports.updateSupplierImportWarehouse = (condition, data, { trx } = {}) =>
    getKnex('warehouse_import', trx).where(condition).update(data)

exports.updateSupplierImportWarehouseById = (id, data, { trx } = {}) =>
    exports.updateSupplierImportWarehouse({ id }, data, { trx })

exports.insertSupplierImportWarehouseVariation = (data, { trx } = {}) =>
    getKnex('warehouse_import_variation', trx).returning('id').insert(data)

exports.upsertSupplierImportWarehouseVariations = async (data, { trx }) => {
    const insertData = data.filter((i) => !i.id)
    if (!_.isEmpty(insertData))
        await exports.insertSupplierImportWarehouseVariation(insertData, { trx })

    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map((item) => {
            const { id, warehouse_import_id, ...updateBody } = item

            const query = getKnex('warehouse_import_variation', trx)
                .where({ id, warehouse_import_id })
                .update(updateBody)

            return query
        })

        await Promise.all(queries)
    }

    return true
}

exports.updateSupplierImportWarehouseVariation = (condition, data, { trx } = {}) =>
    getKnex('warehouse_import_variation', trx).where(condition).update(data)

exports.updateSupplierImportWarehouseVariationByImportWarehouseId = (id, data, { trx } = {}) =>
    exports.updateSupplierImportWarehouseVariation({ warehouse_import_id: id }, data, { trx })

exports.getWarehouseImports = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'wi.*',
            'sw.name as supplier_warehousing_name',
            'u1.full_name as user_import_name',
            'u2.full_name as user_created_name',
            'u3.full_name as approved_by',
            knex.raw(
                `ARRAY(SELECT row_to_json(wiv.*)
                FROM warehouse_import_variation as wiv
                WHERE warehouse_import_id = wi.id AND wi.is_deleted = false
                ) AS products`
            ),
        )
        .from('warehouse_import as wi')
        .innerJoin('supplier_warehousing as sw', 'wi.supplier_warehousing_id', 'sw.id')
        .leftJoin('user as u1', 'wi.user_import_id', 'u1.id')
        .leftJoin('user as u2', 'wi.user_created_id', 'u2.id')
        .leftJoin('user as u3', 'wi.approved_by', 'u3.id')
        .where('wi.is_deleted', false)

    if (options.tenant_id)
        query = query.andWhere('wi.tenant_id', options.tenant_id)

    if (options.partner_id)
        query = query.andWhere('wi.partner_id', options.partner_id)

    if (options.user_created_id)
        query = query.andWhere('wi.user_created_id', options.user_created_id)

    if (options.supplier_id)
        query = query.andWhere('wi.supplier_id', options.supplier_id)

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        query = query.where('wi.is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('wi.reason', 'ilike', `%${whereCondition.keyword}%`)
                // builder.orWhereRaw(
                //     `metadata->'user_info'->>'representative_name' ilike ? `,
                //     [`%${whereCondition.keyword}%`]
                // )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'wi.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
        if (whereCondition?.status) {
            condition['wi.status'] = whereCondition.status
        }

        query = query.andWhere(condition)
    }
    const result = await query
        .orderBy(options.order_by || 'wi.id', options.order_direction)
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

exports.getWarehouseImportDetail = (condition) =>
    knex.first().from('warehouse_import').where(condition)

exports.getWarehouseImportDetailById = (id) => exports.getWarehouseImportDetail({ id })

exports.getWarehouseImportVariationDetail = (condition) =>
    knex.first().from('warehouse_import_variation').where(condition)

exports.getWarehouseImportVariationDetailById = (id) => exports.getWarehouseImportDetail({ id })

exports.getWarehouseImportVariation = (condition) =>
    knex
        .select(
            'wiv.*',
            knex.raw(`json_build_object('productName', "p".name, 
            'thumb', CASE WHEN "p".has_variation = false THEN "p".thumb ELSE to_jsonb("product_image".*) END,
            'sku', CASE WHEN "p".has_variation = false THEN "p".sku ELSE "pv".sku END,
            'name', CONCAT_WS(' - ', "pv".option_1, "pv".option_2, "pv".option_3)) as variation`)
        )
        .from('warehouse_import_variation as wiv')
        .leftJoin('product_variation as pv', 'wiv.product_variation_id', 'pv.id')
        .joinRaw(
            ' LEFT JOIN product_image ON pv.product_image_id = product_image.id AND product_image.is_deleted = false'
        )
        .leftJoin('product as p', 'wiv.product_id', 'p.id')
        .where(condition)

exports.getWarehouseImportDetailOnly = async (id, options = {}) => {
    const condition = { 'warehouse_import.is_deleted': false }
    if (options.partner_id) condition['warehouse_import.partner_id'] = options.partner_id
    if (options.status) condition['warehouse_import.status'] = options.status
    if (options.publish_status)
        condition['warehouse_import.publish_status'] = options.publish_status

    const [warehouse_import, products] = await Promise.all([
        knex
            .select(['warehouse_import.*'])
            .from('warehouse_import')
            .first()
            .where(condition)
            .andWhere('warehouse_import.id', id)
            .groupBy('warehouse_import.id'),
        exports.getWarehouseImportVariation({
            warehouse_import_id: id
        })
    ])

    return { ...warehouse_import, products }
}

exports.insertExportWarehouse = (data, { trx } = {}) =>
    getKnex('warehouse_export', trx).returning('id').insert(data)

exports.updateSupplierExportWarehouse = (condition, data, { trx } = {}) =>
    getKnex('warehouse_export', trx).where(condition).update(data)

exports.getWarehouseExportDetail = (condition) =>
    knex.first().from('warehouse_export').where(condition)

exports.getWarehouseExportDetailById = (id) => exports.getWarehouseExportDetail({ id })

exports.getWarehouseExports = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'we.*',
            'u.full_name as user_export_name',
            'u1.full_name as user_created_name',
            'o.code as order_code',
            'o.fulfillment_status as order_fulfillment_status',
            knex.raw(
                `(SELECT sum(wev.total_quantity*wiv.total_price)
                FROM warehouse_export_variation as wev
                LEFT JOIN warehouse_import_variation as wiv ON wev.code = wiv.code
                WHERE wev.warehouse_export_id = we.id AND we.is_deleted = false
                ) AS total_price`
            ),
            knex.raw(
                `ARRAY(SELECT row_to_json(wev.*)
                FROM warehouse_export_variation as wev
                WHERE wev.warehouse_export_id = we.id AND we.is_deleted = false
                ) AS products`
            ),
        )
        .from('warehouse_export as we')
        .leftJoin('order as o', 'we.order_id', 'o.id')
        .leftJoin('user as u', 'we.user_export_id', 'u.id')
        .leftJoin('user as u1', 'we.user_created_id', 'u1.id')
        .where('we.is_deleted', false)

    if (options.tenant_id)
        query = query.andWhere('we.tenant_id', options.tenant_id)

    if (options.partner_id)
        query = query.andWhere('we.partner_id', options.partner_id)

    if (options.user_export_id)
        query = query.andWhere('we.user_export_id', options.user_export_id)

    if (options.supplier_id)
        query = query.andWhere('we.supplier_id', options.supplier_id)

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        query = query.where('we.is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('we.reason', 'ilike', `%${whereCondition.keyword}%`)
                // builder.orWhereRaw(
                //     `metadata->'user_info'->>'representative_name' ilike ? `,
                //     [`%${whereCondition.keyword}%`]
                // )

                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere(
                        'we.id',
                        parseInt(whereCondition.keyword, 10)
                    )

                return builder
            })
        }
        if (whereCondition?.status) {
            condition['we.status'] = whereCondition.status
        }

        query = query.andWhere(condition)
    }
    const result = await query
        .orderBy(options.order_by || 'we.id', options.order_direction)
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

exports.insertExportWarehouseVariation = (data, { trx } = {}) =>
    getKnex('warehouse_export_variation', trx).returning('id').insert(data)

exports.getExportWarehouseVariation = (condition) =>
    knex.first().from('warehouse_export_variation').where(condition)

exports.getManyExportWarehouseVariation = (condition) =>
    knex.select().from('warehouse_export_variation').where(condition)

exports.incrementExportWarehouseVariation = (condition, body, { trx } = {}) =>
    getKnex('warehouse_export_variation', trx).increment(body).where(condition)

exports.updateExportWarehouseVariation = (condition, data, { trx } = {}) =>
    getKnex('warehouse_export_variation', trx).where(condition).update(data)

exports.updateExportWarehouseVariationByOrderId = (id, data, { trx } = {}) =>
    exports.updateExportWarehouseVariation({ order_id: id }, data, { trx })

exports.getWarehouseExportVariation = (condition) =>
    knex
        .select(
            'wev.*',
            'wiv.production_date',
            'wiv.expiry_date',
            'wiv.total_price',
            'wiv.total_quantity as total_import_quantity',
            'wiv.remaining_quantity',
            knex.raw(`json_build_object('productName', "p".name, 
    'thumb', CASE WHEN "p".has_variation = false THEN "p".thumb ELSE to_jsonb("product_image".*) END,
    'sku', CASE WHEN "p".has_variation = false THEN "p".sku ELSE "pv".sku END,
    'name', CONCAT_WS(' - ', "pv".option_1, "pv".option_2, "pv".option_3)) as variation`)
        )
        .from('warehouse_export_variation as wev')
        .innerJoin('warehouse_import_variation as wiv', 'wev.code', 'wiv.code')
        .leftJoin('product_variation as pv', 'wiv.product_variation_id', 'pv.id')
        .joinRaw(
            ' LEFT JOIN product_image ON pv.product_image_id = product_image.id AND product_image.is_deleted = false'
        )
        .leftJoin('product as p', 'wiv.product_id', 'p.id')
        .where(condition)

exports.incrementRemainingQty = (code, total, { trx } = {}) =>
    getKnex('warehouse_import_variation', trx)
        .increment('remaining_quantity', total)
        .where('code', code)

exports.decrementRemainingQty = (code, total, { trx } = {}) =>
    getKnex('warehouse_import_variation', trx)
        .decrement('remaining_quantity', total)
        .where('code', code)