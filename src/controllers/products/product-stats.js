/* eslint-disable vars-on-top */
const Joi = require('joi')
const { parseOption } = require('../../utils/pagination')
const Supplier = require('../../models/supplier')
const ProductStatsService = require('../../services/stats-product.service')

exports.supplierReportSoldProduct = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().iso().optional(),
            to_time: Joi.date().iso().optional(),
            keyword: Joi.string().min(2),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id

    option.order_direction = 'desc'
    const data = await ProductStatsService.supplierReportSoldProduct(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierReportLowQuantityProduct = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id

    option.order_direction = 'desc'
    const data = await ProductStatsService.supplierReportLowQuantityProduct(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierReportStatusWorkDashbroad = async (request) => {
    const { user } = request

    const { ...query } = await Joi.object().validateAsync(request.query, {
        stripUnknown: false,
        allowUnknown: true,
    })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id

    const data = await ProductStatsService.supplierReportStatusWorkDashbroad(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierReportDashbroad = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().optional(),
            to_time: Joi.date().optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id

    option.order_direction = 'desc'
    option.tenant_id = user.tenant_id
    const data = await ProductStatsService.supplierReportDashbroad(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierTopSeller = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().optional(),
            to_time: Joi.date().optional(),
            keyword: Joi.string().min(2),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id

    option.order_direction = 'desc'
    const data = await ProductStatsService.supplierTopSeller(option, query)

    return {
        is_success: true,
        ...data,
    }
}
