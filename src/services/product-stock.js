/* eslint-disable consistent-return */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
const { knex, useMyTrx } = require('../connections/pg-general')
const { INVENTORY_CHANGE_TYPE } = require('../constants')
const ProductInventoryHistory = require('../models/product-inventory-history')
const ProductVariationStock = require('../models/product-variation-stock')
const ProductStock = require('../models/product-stock')
const ProductVariation = require('../models/product-variation')
const AuditLog = require('../models/audit-log')

exports.updateProductStock = async (
    user,
    {
        variations,
        id,
        ...body
    },
    currentProduct
) => {
    const result = await knex.transaction(async (trx) => {

        const variationIds = variations.filter((i) => !!i.id).map((i) => i.id)

        const variationsInDB =
            await ProductVariationStock.getProductVariationsStockByIdsAndProductStockId({
                ids: variationIds,
                product_stock_id: id,
            })

        if (variationIds.length !== variationsInDB.length) {
            throw new Error('invalid_variation_id')
        }

        // TODO: update product variations
        let totalQuantity = 0
        const variationsUpdateData = variations.map((variation) => {
            let variationUpdate = {
                product_stock_id: id,
                status: variation.status,
                total_quantity: variation.total_quantity,
            }

            if (variation.id) variationUpdate.id = variation.id.toString()

            if (variation.total_quantity)
                totalQuantity += variation.total_quantity

            return variationUpdate
        })

        await ProductVariationStock.upsertProductVariationsStock(variationsUpdateData, {
            trx,
        })

        await ProductStock.updateById(
            id,
            {
                // eslint-disable-next-line prettier/prettier
                ...(totalQuantity !== 0 && { total_quantity: totalQuantity }),
            },
            {
                trx,
            }
        )

        return {
            id,
        }
    })

    AuditLog.addProductStockLogAsync(currentProduct.id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        current_data: currentProduct,
        change_to_data: { id, variations, ...body },
    })

    return result
}

exports.SupplierInsertProductStock = async (
    data,
    value,
    tenant_id
) => {
    const dataInsert = data.map(item => {
        const newDataInsert = {
            ...value,
            product_id: item,
            tenant_id: tenant_id
        }

        return newDataInsert
    })

    const result = await useMyTrx(null, async (trx) => {
        const listProductStock = await Promise.all(
            dataInsert.map(
                async (product) => {
                    const [newProductStock] = await ProductStock.insert(product, { trx })
                    const variations = await ProductVariation.getProductVariationsByProductId(product.product_id)
                    await ProductVariationStock.insertProdcutVariationStock(
                        variations.map(item => {
                            const newVariation = {
                                product_variation_id: item.id,
                                product_stock_id: newProductStock
                            }

                            return newVariation
                        })
                        ,
                        { trx }
                    )

                    return newProductStock
                }
            )
        )

        return listProductStock
    })

    return result
}

exports.updateProductStockQuantity = async (
    user,
    { id, total_quantity, real_quantity, variations },
    currentProduct,
    currentVariations
) => {
    if (currentProduct.id !== id) throw new Error('invalid_product_id')
    let nextTotalQuantity = total_quantity
    let nextRealQuantity = real_quantity
    const historyDetail = []
    const historyDetailReal = []
    // calculate total product
    if (currentProduct.has_variation && currentVariations) {
        nextTotalQuantity = 0
        nextRealQuantity = 0
        currentVariations.forEach((item) => {
            // found change item
            const existed = variations.find((x) => x.id === item.id)
            if (existed && existed.total_quantity !== item.total_quantity) {
                nextTotalQuantity += existed.total_quantity
                historyDetail.push({
                    variation_sku: item.sku,
                    origin_value: item.total_quantity,
                    next_value: existed.total_quantity,
                    change_value: existed.total_quantity - item.total_quantity,
                    change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                    change_description: 'Cập nhật tồn kho',
                })
            } else {
                nextTotalQuantity += item.total_quantity
            }
            if (existed && existed.real_quantity !== item.real_quantity) {
                nextRealQuantity += existed.real_quantity
                historyDetailReal.push({
                    variation_sku: item.sku,
                    origin_value: item.real_quantity,
                    next_value: existed.real_quantity,
                    change_value: existed.real_quantity - item.real_quantity,
                    change_type: INVENTORY_CHANGE_TYPE.REAL,
                    change_description: 'Cập nhật tồn kho thực',
                })
            } else {
                nextRealQuantity += item.real_quantity
            }
        })
    }
    const result = knex.transaction(async (trx) => {
        if (currentProduct.has_variation && variations) {
            const variationQuery = variations.map((variation) =>
                ProductVariationStock.updateProductVariationStockQuantity(
                    variation.id,
                    variation.total_quantity,
                    variation.real_quantity,
                    { trx }
                )
            )
            await Promise.all(variationQuery)
            // update product total quantity
            if (nextTotalQuantity !== currentProduct.total_quantity) {
                const updateProductResult = await ProductStock.updateById(
                    id,
                    {
                        total_quantity: nextTotalQuantity,
                    },
                    {
                        trx,
                    }
                )
                await ProductInventoryHistory.insertHistory(
                    {
                        user_id: user.id,
                        // id: auto gen
                        product_id: currentProduct.product_id,
                        product_stock_id: id,
                        origin_value: currentProduct.total_quantity,
                        next_value: nextTotalQuantity,
                        change_value:
                            nextTotalQuantity - currentProduct.total_quantity,
                        change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                        change_description: 'Cập nhật tồn kho',
                        change_detail: JSON.stringify(historyDetail),
                    },
                    { trx }
                )
            }
            if (nextRealQuantity !== currentProduct.real_quantity) {
                const updateProductResult = await ProductStock.updateById(
                    id,
                    {
                        real_quantity: nextRealQuantity,
                    },
                    {
                        trx,
                    }
                )
                await ProductInventoryHistory.insertHistory(
                    {
                        user_id: user.id,
                        // id: auto gen
                        product_id: currentProduct.product_id,
                        product_stock_id: id,
                        origin_value: currentProduct.real_quantity,
                        next_value: nextRealQuantity,
                        change_value:
                            nextRealQuantity - currentProduct.real_quantity,
                        change_type: INVENTORY_CHANGE_TYPE.REAL,
                        change_description: 'Cập nhật tồn kho thực',
                        change_detail: JSON.stringify(historyDetailReal),
                    },
                    { trx }
                )
            }
        } else if (nextTotalQuantity !== currentProduct.total_quantity || nextRealQuantity !== currentProduct.real_quantity) {
            if (nextTotalQuantity !== currentProduct.total_quantity) {
                await ProductVariationStock.updateProductVariationStock(
                    {
                        product_stock_id: id,
                    },
                    {
                        total_quantity: nextTotalQuantity,
                    },
                    { trx }
                )
                const updateProductResult = await ProductStock.updateById(
                    id,
                    {
                        total_quantity: nextTotalQuantity,
                    },
                    { trx }
                )
                await ProductInventoryHistory.insertHistory(
                    {
                        user_id: user.id,
                        // id: auto gen
                        product_id: currentProduct.product_id,
                        product_stock_id: id,
                        origin_value: currentProduct.total_quantity,
                        next_value: nextTotalQuantity,
                        change_value:
                            nextTotalQuantity - currentProduct.total_quantity,
                        change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                        change_description: 'Cập nhật tồn kho',
                    },
                    { trx }
                )
            } else if (nextRealQuantity !== currentProduct.real_quantity) {
                await ProductVariationStock.updateProductVariationStock(
                    {
                        product_stock_id: id,
                    },
                    {
                        real_quantity: nextRealQuantity,
                    },
                    { trx }
                )
                const updateProductResult = await ProductStock.updateById(
                    id,
                    {
                        real_quantity: nextRealQuantity,
                    },
                    { trx }
                )
                await ProductInventoryHistory.insertHistory(
                    {
                        user_id: user.id,
                        // id: auto gen
                        product_id: currentProduct.product_id,
                        product_stock_id: id,
                        origin_value: currentProduct.real_quantity,
                        next_value: nextRealQuantity,
                        change_value:
                            nextTotalQuantity - currentProduct.real_quantity,
                        change_type: INVENTORY_CHANGE_TYPE.REAL,
                        change_description: 'Cập nhật tồn kho thực',
                    },
                    { trx }
                )
            }

        }
    })

    return result
}