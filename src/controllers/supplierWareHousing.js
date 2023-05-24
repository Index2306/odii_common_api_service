const Joi = require('joi')
const _ = require('lodash')
const SupplierWareHousing = require('../models/supplierWareHousing')
const Supplier = require('../models/supplier')
const Tenant = require('../models/tenant')
const ProductService = require('../services/product')
const { parseOption } = require('../utils/pagination')
const Location = require('../models/location')
const { knex } = require('../connections/pg-general')
const { ACC_TYPE } = require('../constants')

exports.getSupplierWareHousings = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            supplier_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    
    query.tenant_id = user.tenant_id

    const data = await SupplierWareHousing.getSupplierWareHousings(
        option,
        query
    )
    let promises = []

    promises = data.data.map(async (item) => ({
        ...item,
        ...(await ProductService.productInWarehousing(item.id)),
    }))
    const result = await Promise.all(promises)
    const newData = { ...data }
    newData.data = result

    return {
        is_success: true,
        ...newData,
    }
}

exports.createSupplierWareHousing = async (request) => {
    const { user } = request
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const { location_data, ...ware_housing } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            description: Joi.string(),
            thumb: Joi.object().allow(null),
            phone: Joi.string(),
            is_pickup_address: Joi.boolean(),
            is_return_address: Joi.boolean(),
            location_data: Joi.object({
                address1: Joi.string().required(),
                address2: Joi.string(),
                province: Joi.string().required(),
                province_code: Joi.string(),
                province_id: Joi.string(),
                country: Joi.string().required(),
                country_code: Joi.string(),
                district_id: Joi.number(),
                district_name: Joi.string(),
                ward_id: Joi.number(),
                ward_name: Joi.string(),
                city: Joi.string(),
            }),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    const dataStock = await SupplierWareHousing.getAllSupplierWareHousing({
        tenant_id: user.tenant_id,
        status: 'active',
    })

    if (dataStock.length >= subscript.rule.maxStock) {
        throw new Error('Số kho hoạt động đã đạt mức tối đa cho phép của gói. Xin liên hệ với Odii để nâng hạn mức số kho')
    }

    await knex.transaction(async (trx) => {
        const [locationId] = await Location.insertLocation(
            { ...location_data, partner_id: user.partner_id },
            { trx }
        )
        await SupplierWareHousing.insertSupplierWareHousing(
            {
                ...ware_housing,
                partner_id: user.partner_id,
                supplier_id: supplier.id,
                location_id: locationId,
                tenant_id : user.tenant_id,
            },
            { trx }
        )
    })

    return {
        is_success: true,
    }
}

exports.updateSupplierWareHousing = async (request) => {
    const { id, location_data, ...ware_housing } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string().required(),
            description: Joi.string(),
            thumb: Joi.object().allow(null),
            phone: Joi.string(),
            is_pickup_address: Joi.boolean(),
            is_return_address: Joi.boolean(),
            location_data: Joi.object({
                address1: Joi.string().required(),
                address2: Joi.string(),
                province: Joi.string().required(),
                province_code: Joi.string(),
                province_id: Joi.string(),
                country: Joi.string().required(),
                country_code: Joi.string(),
                district_id: Joi.number(),
                district_name: Joi.string(),
                ward_id: Joi.number(),
                ward_name: Joi.string(),
                city: Joi.string(),
            }),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            {
                stripUnknown: true,
            }
        )
    const supplierWareHousing = await SupplierWareHousing.getWareHousingById(id)

    if (!supplierWareHousing) {
        throw new Error('supplier_ware_housing_id_not_found')
    }
    await knex.transaction(async (trx) => {
        await Location.updateLocationById(
            supplierWareHousing.location_id,
            { ...location_data },
            { trx }
        )
        await SupplierWareHousing.updateSupplierWareHousingById(
            id,
            {
                ...ware_housing,
            },
            { trx }
        )
    })

    return {
        is_success: true,
    }
}
exports.getSupplierWareHousingDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await SupplierWareHousing.getSupplierWareHousingById(id)

    if (_.isEmpty(data)) {
        throw new Error('supplier ware housing id not found')
    }

    return {
        is_success: true,
        data,
    }
}
exports.supGetSupplierWareHousingDetail = async (request) => {
    const option = parseOption(request.query)
    const { user } = request
    if (!user.account_type === ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    option.partner_id = user.partner_id

    const data = await SupplierWareHousing.getSupplierWareHousingById(
        id,
        option
    )
    if (_.isEmpty(data)) {
        throw new Error('supplier ware housing id not found')
    }

    return {
        is_success: true,
        data,
    }
}
exports.deleteSupplierWareHousing = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await SupplierWareHousing.getSupplierWareHousingById(id)

    if (!data) {
        throw new Error('supplier_ware_housing_id_not_found')
    }

    await SupplierWareHousing.deleteSupplierWareHousingById(id)

    return {
        is_success: true,
    }
}
exports.supGetWareHousings = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)

    if (!supplier) throw new Error('supplier_not_found_or_not_activated_yet')

    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    query.supplier_id = supplier.id
    query.tenant_id = user.tenant_id

    const data = await SupplierWareHousing.getSupplierWareHousings(
        option,
        query
    )

    const result = await Promise.all(
        data.data.map(async (item) => ({
            ...item,
            ...(await ProductService.productInWarehousing(item.id)),
        }))
    )
    data.data = result

    return {
        is_success: true,
        ...data,
    }
}
