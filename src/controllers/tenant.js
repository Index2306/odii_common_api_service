const Joi = require('joi')
const { createTenant, createSubscription, getStatsSubscription, cancelSubscription, updateSubscription } = require('../services/tenant')
const Tenant = require('../models/tenant')
const Location = require('../models/location')
const { parseOption } = require('../utils/pagination')

exports.signup = async (request) => {
    const value = await Joi.object()
        .keys({
            crm_tenant_id: Joi.string().required(),
            email: Joi.string().email().required(),
            seller_domain: Joi.string().required(),
            supplier_domain: Joi.string().required(),
            admin_domain: Joi.string().required(),
            phone: Joi.string().required(),
            full_name: Joi.string().required(),
        })
        .and('email')
        .validateAsync(
            { ...request.body },
            { stripUnknown: true }
        )
    const tenant = await Tenant.getTenant({
        email: value.email,
        is_deleted: false,
    })

    if (tenant) {
        throw new Error('tenant_already_exist')
    }

    const data = await createTenant(value)

    return {
        is_success: true,
        ...data,
    }
}

exports.updateTenant = async (request) => {
    const value = await Joi.object()
        .keys({
            email: Joi.string().email(),
            name: Joi.string(),
            crm_tenant_id: Joi.string().required(),
            status: Joi.string().valid('active', 'inactive'),
            seller_domain: Joi.string(),
            supplier_domain: Joi.string(),
            admin_domain: Joi.string(),
            phone: Joi.string(),
            full_name: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const tenant = await Tenant.getDomain({ crm_tenant_id: value.crm_tenant_id })

    if (!tenant) {
        throw new Error('tenant_not_exist')
    }
    if (value.status === tenant.status) {
        throw new Error(`tenant_is_${value.status}`)
    }

    const data = await Tenant.updateTenant(value)

    return {
        is_success: true,
        ...data,
    }
}

exports.createSubscription = async (request) => {
    const value = await Joi.object()
        .keys({
            crm_subscription_id: Joi.string().required(),
            crm_tenant_id: Joi.string().required(),
            name: Joi.string(),
            durationByDay: Joi.number().allow(null),
            rule: Joi.object()
                .keys({
                    maxSeller: Joi.number().allow(null),
                    maxOrder: Joi.number().allow(null),
                    maxStock: Joi.number().allow(null),
                    maxSupplier: Joi.number().allow(null),
                }).required()
        })
        .validateAsync(
            { ...request.body },
            { stripUnknown: true }
        )

    const tenant = await Tenant.getDomain({ crm_tenant_id: value.crm_tenant_id })

    if (!tenant) {
        throw new Error('tenant_not_exist')
    }

    const subscript = await Tenant.getSubscription({ crm_subscription_id: value.crm_subscription_id })
    if (subscript) {
        throw new Error('subscription_already_exist')
    }

    const values = {
        ...value,
        tenant_id: tenant.id,
    }

    const subscription_id = await createSubscription(values)

    if (!subscription_id) {
        throw new Error('subscription_created_fail')
    }

    return {
        is_success: true
    }
}

exports.cancelSubscription = async (request) => {
    const value = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const subscript = await Tenant.getSubscription({
        crm_subscription_id: value.id,
    })

    if (!subscript) {
        throw new Error('subscription_not_exist')
    }

    await cancelSubscription(subscript)

    return {
        is_success: true,
    }
}


exports.updateSubscription = async (request) => {
    const value = await Joi.object()
        .keys({
            crm_subscription_id: Joi.string().required(),
            name: Joi.string(),
            durationByDay: Joi.number().allow(null),
            status: Joi.string().default('active'),
            rule: Joi.object()
                .keys({
                    maxSeller: Joi.number().allow(null),
                    maxOrder: Joi.number().allow(null),
                    maxStock: Joi.number().allow(null),
                    maxSupplier: Joi.number().allow(null),
                })

        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const subscript = await Tenant.getSubscription({ crm_subscription_id: value.crm_subscription_id })

    if (!subscript) {
        throw new Error('subscription_not_exist')
    }

    const values = {
        ...value,
        subscription: subscript,
    }

    const data = await updateSubscription(values)

    return {
        is_success: true,
        ...data,
    }
}

exports.getStatsSubscription = async (request) => {
    const value = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params },
            { stripUnknown: true }
        )

    const subscript = await Tenant.getSubscriptionById(value.id)

    if (!subscript) {
        throw new Error('subscription_not_exist')
    }

    const tenant = await Tenant.getDomainByTenantId(subscript.tenant_id)

    if (!tenant) {
        throw new Error('tenant_not_exist')
    }

    const data = await getStatsSubscription(tenant.id)

    return {
        is_success: true,
        ...data,
    }
}

exports.getTenantTransaction = async (request) => {
    const option = parseOption(request.params)
    const value = await Joi.object()
        .keys({
            sub_id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const subscript = await Tenant.getSubscriptionById(value.sub_id)

    if (!subscript) {
        throw new Error('subscription_not_exist')
    }

    const tenant = await Tenant.getDomainByTenantId(subscript.tenant_id)

    if (!tenant) {
        throw new Error('tenant_not_exist')
    }

    const data = await Tenant.getAllTenantTransaction(subscript.id, option)

    return {
        is_success: true,
        ...data,
    }
}

exports.getTenantTransports = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            only_platform: Joi.string(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })

    const tenant = await Tenant.getDomainByTenantId(user.tenant_id)

    if (!tenant) {
        throw new Error('tenant_not_exist')
    }

    if (value.only_platform) {

        const data = await Tenant.getAllTenantTransportPlatform({
            tenant_id: tenant.id,
            status: 'active'
        })

        return {
            is_success: true,
            data: data
        }
    }

    const data = await Tenant.getAllTenantTransport({
        tenant_id: tenant.id
    })

    return {
        is_success: true,
        data: data
    }
}

exports.createTenantTransport = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            platform: Joi.string().required(),
            key: Joi.string().required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const transport = await Tenant.getTenantTransport({
        key: value.key,
        platform: value.platform,
        status: 'active',
    })

    if (transport) {
        throw new Error('Đơn vị đã được liên kết trong hệ thống')
    }

    const values = {
        tenant_id: user.tenant_id,
        ...value,
    }

    await Tenant.insertTenantTransport(values)

    return {
        is_success: true
    }
}

exports.getTenantTransport = async (request) => {
    const value = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Tenant.getTenantTransportById(value.id)

    return {
        is_success: true,
        data: data
    }
}

exports.updateTenantTransport = async (request) => {
    const { user } = request
    const { id, ...value } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            platform: Joi.string(),
            key: Joi.string(),
            status: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const transport = await Tenant.getTenantTransportById(id)

    const activeExits = await Tenant.getAllTenantTransport({
        platform: transport.platform,
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (activeExits?.length >= 1 && value.status === 'active') {
        throw new Error('Đơn vị đã được liên kết trong hệ thống !')
    }

    const exits = await Tenant.getTenantTransport({
        platform: transport.platform,
        key: transport.key,
        status: 'active'
    })

    if (exits && value.status === 'active') {
        throw new Error('Đơn vị đã được liên kết trong hệ thống !')
    }

    await Tenant.updateTenantTransportById(id, value)

    return {
        is_success: true
    }
}