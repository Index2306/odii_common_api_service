const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { ACC_TYPE } = require('../constants')

exports.insertTenant = (data, { trx } = {}) =>
    getKnex('tenant', trx).returning('id').insert(data)

exports.insertTenantTransaction = (data, { trx } = {}) =>
    getKnex('tenant_transaction', trx).returning('id').insert(data)

exports.getTenant = (condition) => knex.first().from('tenant').where(condition)

exports.getTenantByDomain = async (domain, source) => {
    const query = knex
        .first()
        .from('tenant')
        .where('tenant.is_deleted', false)

    if (source === ACC_TYPE.SELLER) {
        query.andWhere('tenant.seller_domain', domain)
    }

    if (source === ACC_TYPE.SUP) {
        query.andWhere('tenant.supplier_domain', domain)
    }

    if (source === ACC_TYPE.ADMIN) {
        query.andWhere('tenant.admin_domain', domain)
    }

    const result = await query

    return result
}

exports.getAllDomains = (condition) => knex.from('tenant').where(condition)

exports.getDomain = (condition) => knex.first().from('tenant').where(condition)

exports.getDomainByTenantId = (id) => exports.getDomain({ id })

exports.updateTenant = (condition, data, { trx } = {}) =>
    getKnex('tenant', trx).update(data).where(condition)

exports.updateTenantById = (id, data, { trx } = {}) =>
    exports.updateTenant({ id }, data, { trx })

exports.insertSupcription = (data, { trx } = {}) =>
    getKnex('tenant_subscription', trx).returning('id').insert(data)

exports.updateSubscription = (condition, data, { trx } = {}) =>
    getKnex('tenant_subscription', trx).update(data).where(condition)

exports.updateSubscriptionById = (id, data, { trx } = {}) =>
    exports.updateSubscription({ id }, data, { trx })

exports.getSubscription = (condition) => knex.first().from('tenant_subscription').where(condition)

exports.getSubscriptionById = (id) => exports.getSubscription({ id })

exports.deleteSubscription = (condition, { trx } = {}) => getKnex('tenant_subscription', trx).where(condition).del()

exports.deleteSubscriptionById = (id, { trx } = {}) => exports.deleteSubscription({ id }, { trx })

exports.getAllTenantTransaction = async (id, options = {}) => {
    const query = knex
        .select('tt.*')
        .from('tenant_subscription as ts')
        .innerJoin('tenant_transaction as tt', 'tt.subscription_id', 'ts.id')
        .where('ts.id', id)
        .groupBy('ts.id', 'tt.id')

    const result = await query
        .orderBy(options?.order_by || 'ts.id', options?.order_direction)
        .paginate(options?.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options?.page,
            page_size: options?.page_size,
        },
        data: result.data,
    }
}

exports.getAllTenantTransportPlatform = (condition) => knex.select(['tt.id', 'tt.platform', 'tt.status']).from('tenant_transport as tt').where(condition)

exports.getAllTenantTransport = (condition) => knex.from('tenant_transport').where(condition).orderBy('tenant_transport.id', 'desc')

exports.getTenantTransport = (condition) => knex.first().from('tenant_transport').where(condition)

exports.getTenantTransportById = (id) => exports.getTenantTransport({ id })

exports.insertTenantTransport = (data, { trx } = {}) =>
    getKnex('tenant_transport', trx).returning('id').insert(data)

exports.updateTenantTransport = (condition, data, { trx } = {}) =>
    getKnex('tenant_transport', trx).update(data).where(condition)

exports.updateTenantTransportById = (id, data, { trx } = {}) =>
    exports.updateTenantTransport({ id }, data, { trx })