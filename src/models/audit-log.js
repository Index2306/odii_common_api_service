/* eslint-disable camelcase */
const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.LOG_TYPE = {
    ORDER: 'order',
    PRODUCT: 'product',
    TRANSACTION: 'transaction',
    COMMON: 'common',
    DEBT: 'partner_debt',
    PRODUCT_STOCK: 'product_stock',
}

exports.ACTION_TYPE = {
    UPDATE: 'update',
    CREATE: 'create',
    PENDING: 'pending',
    DELETE: 'delete',
    COMMENT: 'comment',
}

exports.getAuditLogs = async (options = {}, whereCondition) => {
    let query = knex.select().from('audit_log')
    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('metadata', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'province_code',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere('note', 'ilike', `%${whereCondition.keyword}%`)
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere('id', parseInt(whereCondition.keyword, 10))

                return builder
            })
        }
    }
    const result = await query
        .orderBy(options.order_by || 'audit_log.id', options.order_direction)
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

exports.insertAuditLog = (data) =>
    knex('audit_log').returning('id').insert(data)

exports.insertAuditLogAsync = async (data) => {
    await knex('audit_log').returning('id').insert(data)
}

exports.addOrderLogAsync = async (
    order_id,
    { metadata, current_data, change_to_data, ...data }
) => {
    const body = {
        ...data,
        order_id,
        type: exports.LOG_TYPE.ORDER,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { metadata: JSON.stringify(current_data) }),
        ...(change_to_data && { metadata: JSON.stringify(change_to_data) }),
    }
    await knex('audit_log').returning('id').insert(body)
}

exports.addProductLogAsync = async (
    product_id,
    { metadata, current_data, change_to_data, action, ...data }
) => {
    const body = {
        ...data,
        product_id,
        type: exports.LOG_TYPE.PRODUCT,
        action,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { current_data: JSON.stringify(current_data) }),
        ...(change_to_data && {
            change_to_data: JSON.stringify(change_to_data),
        }),
    }
    await knex('audit_log').returning('id').insert(body)
}

exports.addStoreProductLogAsync = async (
    product_id,
    { metadata, current_data, change_to_data, action, ...data }
) => {
    const body = {
        ...data,
        product_id,
        type: exports.LOG_TYPE.PRODUCT,
        action,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { current_data: JSON.stringify(current_data) }),
        ...(change_to_data && {
            change_to_data: JSON.stringify(change_to_data),
        }),
    }
    await knex('audit_log').returning('id').insert(body)
}

exports.addTransactionLogAsync = async (
    transaction_id,
    { metadata, current_data, change_to_data, action, ...data }
) => {
    const body = {
        ...data,
        transaction_id,
        type: exports.LOG_TYPE.TRANSACTION,
        action,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { current_data: JSON.stringify(current_data) }),
        ...(change_to_data && {
            change_to_data: JSON.stringify(change_to_data),
        }),
    }
    await knex('audit_log').returning('id').insert(body)
}

exports.addPartnerDebtLogAsync = async (
    partner_debt_id,
    { metadata, current_data, change_to_data, action, ...data },
    { trx }
) => {
    const body = {
        ...data,
        partner_debt_id,
        type: exports.LOG_TYPE.DEBT,
        action,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { current_data: JSON.stringify(current_data) }),
        ...(change_to_data && {
            change_to_data: JSON.stringify(change_to_data),
        }),
    }
    if (trx) await knex('audit_log', trx).returning('id').insert(body)
    else await knex('audit_log').returning('id').insert(body)
}

exports.updateAuditLog = (condition, data) =>
    knex('audit_log').update(data).where(condition)

exports.updateAuditLogById = (id, data) => exports.updateAuditLog({ id }, data)

exports.getAuditLog = (condition) =>
    knex.first().from('audit_log').where(condition)

exports.getAuditLogById = (id) => exports.getAuditLog({ id })

exports.getAuditLogByIdAndType = async (id, options = {}) => {
    const query = knex
        .select(
            'id',
            'action',
            'note',
            'created_at',
            'source',
            'metadata',
            'short_description'
        )
        .from('audit_log')

        .where(`${options.type}_id`, id)
        .andWhere('type', options.type)
    if (options.user) {
        query.where('user_id', options.user)
    }
    const result = await query.orderBy('created_at', 'desc')

    return result
}

exports.addProductStockLogAsync = async (
    product_stock_id,
    { metadata, current_data, change_to_data, action, ...data }
) => {
    const body = {
        ...data,
        product_stock_id,
        type: exports.LOG_TYPE.PRODUCT_STOCK,
        action,
        ...(metadata && { metadata: JSON.stringify(metadata) }),
        ...(current_data && { current_data: JSON.stringify(current_data) }),
        ...(change_to_data && {
            change_to_data: JSON.stringify(change_to_data),
        }),
    }
    await knex('audit_log').returning('id').insert(body)
}