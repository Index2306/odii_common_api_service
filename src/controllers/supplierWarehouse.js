const Joi = require('joi')
const moment = require('moment')
const _ = require('lodash')
const { knex } = require('../connections/pg-general')
const { parseOption } = require('../utils/pagination')
const SupplierWarehouse = require('../models/supplierWarehouse')
const Supplier = require('../models/supplier')
const ProductStock = require('../models/product-stock')
const ProductVariationStock = require('../models/product-variation-stock')
const ProductInventoryHistory = require('../models/product-inventory-history')
const ProductVariation = require('../models/product-variation')
const { getWarehouseImportCode, getBarcode } = require('../utils/common.util')
const { ROLES, INVENTORY_CHANGE_TYPE } = require('../constants')


exports.getListImportWarehouse = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stringUnknown: false, allowUnknown: true }
        )

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) throw new Error('invalid_supplier')

    option.tenant_id = user.tenant_id
    option.partner_id = user.partner_id
    option.supplier_id = supplier.id

    if (user.roles?.includes(ROLES.PARTNER_WAREHOUSE)) {
        option.user_created_id = user.id
    }

    const data = await SupplierWarehouse.getWarehouseImports(option, query)


    return {
        is_success: true,
        ...data,
    }
}

exports.getDetaiImportWarehouse = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await SupplierWarehouse.getWarehouseImportDetailById(id)

    const products = await SupplierWarehouse.getWarehouseImportVariation({
        warehouse_import_id: id
    })

    return {
        is_success: true,
        data: {
            ...data,
            products: products
        },
    }
}

exports.createImportWarehouse = async (request) => {
    const { user } = request

    const { products, ...value } = await Joi.object()
        .keys({
            reason: Joi.string().allow(''),
            time_import: Joi.date().iso().required(),
            time_recall: Joi.date().allow(null).iso(),
            user_import_id: Joi.string().required(),
            user_created_id: Joi.string().required(),
            supplier_warehousing_id: Joi.string().required(),
            created_at: Joi.date().iso().optional(),
            products: Joi.array()
                .items(
                    Joi.object().keys({
                        product_id: Joi.string().required(),
                        total_quantity: Joi.number().required(),
                        total_price: Joi.number(),
                        product_variation_id: Joi.string().required(),
                        production_date: Joi.date().iso().optional().allow(null),
                        expiry_date: Joi.date().iso().optional().allow(null),
                    })
                )
        })
        .validateAsync(
            { ...request.query, ...request.body },
            { stripUnknown: true }
        )

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) throw new Error('invalid_supplier')
    value.partner_id = user.partner_id
    value.supplier_id = supplier.id
    value.tenant_id = user.tenant_id
    value.code = getBarcode()

    const id = await knex.transaction(async (trx) => {
        const [warehouse_import_id] = await SupplierWarehouse.insertSupplierImportWarehouse(value, { trx })

        await SupplierWarehouse.insertSupplierImportWarehouseVariation(
            products.map(item => {
                const newData = {
                    ...item,
                    code: getWarehouseImportCode(),
                    warehouse_import_id: warehouse_import_id
                }
                return newData
            }),
            { trx }
        )

        return warehouse_import_id
    })


    return {
        is_success: true,
        id
    }
}

exports.upsertImportWarehouse = async (request) => {
    const { user } = request

    const { id, products, ...value } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            reason: Joi.string().allow(''),
            time_import: Joi.date().iso().required(),
            time_recall: Joi.date().allow(null).iso(),
            user_import_id: Joi.string().required(),
            user_created_id: Joi.string().required(),
            supplier_warehousing_id: Joi.string().required(),
            created_at: Joi.date().iso().optional(),
            time_approved: Joi.date().iso().optional(),
            approved_by: Joi.string(),
            publish_status: Joi.string(),
            products: Joi.array()
                .items(
                    Joi.object().keys({
                        id: Joi.string().required(),
                        product_id: Joi.string().required(),
                        total_quantity: Joi.number().required(),
                        total_price: Joi.number(),
                        product_variation_id: Joi.string().required(),
                        production_date: Joi.date().iso().optional().allow(null),
                        expiry_date: Joi.date().iso().optional().allow(null),
                        warehouse_import_id: Joi.string().required(),
                        code: Joi.string().required(),
                    })
                )
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const data = await knex.transaction(async (trx) => {
        const updateWarehouseImport = await SupplierWarehouse.updateSupplierImportWarehouseById(
            id,
            {
                ...value,
                updated_at: new Date(),
            },
            {
                trx
            }
        )
        await SupplierWarehouse.upsertSupplierImportWarehouseVariations(
            products.map(item => {
                const newData = {
                    ...item,
                }
                return newData
            }),
            { trx }
        )

        return updateWarehouseImport
    })

    return {
        is_success: true,
        data
    }
}

exports.updateWarehouseImportState = async (request) => {
    const { user } = request
    const { id, publish_status, status } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            publish_status: Joi.string()
                .only()
                .allow('active', 'inactive', 'pending_for_review', 'rejected')
                .required(),
            status: Joi.string().allow(null)
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentWarehouseImport = await SupplierWarehouse.getWarehouseImportDetailOnly(id, {
        partner_id: user.partner_id
    })

    if (!currentWarehouseImport) throw new Error('NOT_FOUND')

    const payload = { id, publish_status, status: status ? status : currentWarehouseImport.status }
    if (
        publish_status === 'pending_for_review' &&
        currentWarehouseImport.status === 'active'
    ) {
        payload.status = 'inactive'
    }

    const formatProductStock = currentWarehouseImport?.products?.reduce((newList, current) => {
        const ids = newList.map(item => item.product_id)
        if (!ids.includes(current.product_id)) {
            const newData = {
                product_id: current.product_id,
                total_quantity: current.total_quantity,
                variations: [
                    {
                        product_variation_id: current.product_variation_id,
                        total_quantity: current.total_quantity,
                    }
                ]
            }
            newList.push(newData)
            return newList
        } else {
            newList.map(item => {
                if (item.product_id === current.product_id) {
                    item.total_quantity += current.total_quantity
                    const id_variations = item.variations.map(variation => variation.product_variation_id)
                    if (!id_variations.includes(current.product_variation_id)) {
                        item.variations.push({
                            product_variation_id: current.product_variation_id,
                            total_quantity: current.total_quantity
                        })
                    } else {
                        item.variations.map(item => {
                            if (item.product_variation_id === current.product_variation_id) {
                                item.total_quantity += current.total_quantity
                            }
                        })
                    }
                }
            })
            return newList
        }
    }, [])

    await knex.transaction(async (trx) => {
        if (status === 'active' && publish_status === 'active') {
            payload.approved_by = user.id
            payload.time_approved = new Date()
            await Promise.all(
                formatProductStock.map(async item => {
                    const productStock = await ProductStock.getOne({
                        product_id: item.product_id,
                        supplier_warehousing_id: currentWarehouseImport.supplier_warehousing_id,
                    })

                    if (productStock && item.total_quantity > 0) {
                        const historyDetail = []
                        const historyDetailReal = []
                        const variationQuery = item.variations?.map(async variation => {
                            const productStockVariation = await ProductVariationStock.getProductVariationStock({
                                product_variation_id: variation.product_variation_id,
                                product_stock_id: productStock.id,
                            })

                            if (_.isEmpty(productStockVariation)) {
                                throw new Error('NOT_FOUND_VARIATION_STOCK')
                            }

                            const productVariation = await ProductVariationStock.getProductVariationsByProductStockId(productStockVariation.id)

                            if (_.isEmpty(productStockVariation)) {
                                throw new Error('NOT_FOUND_VARIATION')
                            }

                            await ProductVariationStock.updateProductVariationStockById(
                                productStockVariation.id,
                                {
                                    real_quantity: productStockVariation.real_quantity + variation.total_quantity,
                                    total_quantity: productStockVariation.total_quantity + variation.total_quantity
                                },
                                { trx }
                            )

                            await ProductStock.updateById(
                                productStock.id,
                                {
                                    real_quantity: productStock.real_quantity + item.total_quantity,
                                    total_quantity: productStock.total_quantity + item.total_quantity
                                },
                                {
                                    trx,
                                }
                            )

                            historyDetail.push({
                                product_variation_stock_id: productStockVariation.id,
                                origin_value: productStockVariation.total_quantity,
                                next_value: productStockVariation.total_quantity + variation.total_quantity,
                                change_value: variation.total_quantity,
                                change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                                change_description: 'Cập nhập tồn kho',
                                warehouse_import_id: id,
                            })

                            historyDetailReal.push({
                                product_variation_stock_id: productStockVariation.id,
                                origin_value: productStockVariation.real_quantity,
                                next_value: productStockVariation.real_quantity + variation.total_quantity,
                                change_value: variation.total_quantity,
                                change_type: INVENTORY_CHANGE_TYPE.IMPORT,
                                change_description: 'Cập nhật tồn kho thực',
                                warehouse_import_id: id,
                            })
                        })

                        await Promise.all(variationQuery)

                        await ProductInventoryHistory.insertHistory(
                            [
                                {
                                    user_id: user.id,
                                    product_id: productStock.product_id,
                                    product_stock_id: productStock.id,
                                    origin_value: productStock.total_quantity,
                                    next_value: productStock.total_quantity + item.total_quantity,
                                    change_value: item.total_quantity,
                                    change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                                    change_description: 'Cập nhật tồn kho',
                                    change_detail: JSON.stringify(historyDetail),
                                },
                                {
                                    user_id: user.id,
                                    // id: auto gen
                                    product_id: productStock.product_id,
                                    product_stock_id: productStock.id,
                                    origin_value: productStock.real_quantity,
                                    next_value: productStock.real_quantity + item.total_quantity,
                                    change_value: item.total_quantity,
                                    change_type: INVENTORY_CHANGE_TYPE.IMPORT,
                                    change_description: 'Cập nhật tồn kho thực',
                                    change_detail: JSON.stringify(historyDetailReal),
                                }
                            ],
                            { trx }
                        )
                    } else if (!productStock) {
                        const [newProductStock] = await ProductStock.insert({
                            real_quantity: item.total_quantity,
                            total_quantity: item.total_quantity,
                            product_id: item.product_id,
                            tenant_id: user.tenant_id,
                            supplier_warehousing_id: currentWarehouseImport.supplier_warehousing_id,
                        }, { trx })

                        const variations = await ProductVariation.getProductVariationsByProductId(item.product_id)
                        const ids_variation_stock = item.variations.map(vari => vari.product_variation_id)

                        await ProductVariationStock.insertProdcutVariationStock(
                            variations.map(variation => {
                                const newVariation = {
                                    product_variation_id: variation.id,
                                    product_stock_id: newProductStock
                                }

                                if (ids_variation_stock.includes(variation.id)) {
                                    return {
                                        ...newVariation,
                                        real_quantity: item.variations.filter(e => e.product_variation_id === variation.id)[0]?.total_quantity,
                                        total_quantity: item.variations.filter(e => e.product_variation_id === variation.id)[0]?.total_quantity
                                    }
                                }

                                return newVariation
                            }),
                            { trx }
                        )
                    }
                })
            )
        }

        await SupplierWarehouse.updateSupplierImportWarehouseById(id, {
            publish_status,
            status: payload.status,
            time_approved: payload.time_approved || null,
            approved_by: payload.approved_by || null,
        }, { trx })
    })

    return {
        is_success: true
    }
}

exports.cancelImportWarehouse = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const currentWarehouseImport = await SupplierWarehouse.getWarehouseImportDetailOnly(id, {
        partner_id: user.partner_id
    })

    if (!currentWarehouseImport) throw new Error('NOT_FOUND')

    if (
        currentWarehouseImport.status !== 'inactive' &&
        currentWarehouseImport.publish_status !== 'inactive'
    ) {
        throw new Error('NOT_ALLOW')
    }

    await knex.transaction(async (trx) => {
        await SupplierWarehouse.updateSupplierImportWarehouseById(id, {
            is_deleted: true,
            updated_at: new Date().toISOString(),
        }, { trx })

        await SupplierWarehouse.updateSupplierImportWarehouseVariationByImportWarehouseId(id, {
            is_deleted: true
        }, { trx })
    })



    return {
        is_success: true,
        warehouse_import_id: id,
    }
}

exports.getListExportWarehouse = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stringUnknown: false, allowUnknown: true }
        )

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) throw new Error('invalid_supplier')

    option.tenant_id = user.tenant_id
    option.partner_id = user.partner_id
    option.supplier_id = supplier.id

    const data = await SupplierWarehouse.getWarehouseExports(option, query)
    return {
        is_success: true,
        ...data,
    }
}

exports.getDetaiExportWarehouse = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await SupplierWarehouse.getWarehouseExportDetailById(id)
    if (!data) throw new Error('invalid_export_warehouse')

    const products = await SupplierWarehouse.getWarehouseExportVariation({
        warehouse_export_id: id
    })

    return {
        is_success: true,
        data: {
            ...data,
            products: products
        },
    }
}

exports.getListVariationImportWarehouse = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await SupplierWarehouse.getWarehouseImportDetailById(id)
    if (!data) throw new Error('invalid_import_warehouse')

    const products = await SupplierWarehouse.getWarehouseImportVariation({
        warehouse_import_id: id
    })

    return {
        is_success: true,
        data: products,
    }
}

exports.createExportWarehouse = async (request) => {
    const { user } = request

    const { products, ...values } = await Joi.object()
        .keys({
            reason: Joi.string().allow(''),
            warehouse_import_id: Joi.string().required(),
            products: Joi.array()
                .items(
                    Joi.object().keys({
                        total_quantity: Joi.number().required(),
                        code: Joi.string().required(),
                        product_id: Joi.string().required(),
                        product_variation_id: Joi.string().required(),
                    })
                )
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const warehouseImport = await SupplierWarehouse.getWarehouseImportDetailById(values.warehouse_import_id)
    if (!warehouseImport) throw new Error('invalid_import_warehouse')

    const warehouseExport = await SupplierWarehouse.getWarehouseExportDetail({
        warehouse_import_id: warehouseImport.id
    })
    if (warehouseExport) throw new Error('Lần nhập hàng này đã có phiếu thu hồi')

    const id = await knex.transaction(async (trx) => {
        const [warehouse_export_id] = await SupplierWarehouse.insertExportWarehouse(
            {
                ...values,
                user_created_id: user.id,
                supplier_id: supplierOfUser.id,
                partner_id: user.partner_id,
                tenant_id: user.tenant_id,
                time_export: new Date(),
                user_export_id: user.id,
                code: getBarcode(),
            },
            { trx }
        )
        await SupplierWarehouse.insertExportWarehouseVariation(
            products.map(item => ({
                code: item.code,
                total_quantity: item.total_quantity,
                warehouse_export_id: warehouse_export_id
            })),
            { trx }
        )

        await SupplierWarehouse.updateSupplierImportWarehouseById(warehouseImport.id, {
            user_recall_id: user.id
        }, { trx })

        await Promise.all(
            products.map(async productItem => {
                const product_stock = await ProductStock.getOne({
                    product_id: productItem.product_id,
                    supplier_warehousing_id: warehouseImport.supplier_warehousing_id
                })
                const product_stock_variation = await ProductVariationStock.getProductVariationStock({
                    product_stock_id: product_stock.id,
                    product_variation_id: productItem.product_variation_id
                })
                await ProductStock.decrementQtyProductStock(product_stock.id, productItem.total_quantity, { trx })
                await ProductVariationStock.decrementQtyProductVariationStock(product_stock_variation.id, productItem.total_quantity, { trx })
            })
        )

        return warehouse_export_id
    })

    return {
        is_success: true,
        id
    }
}