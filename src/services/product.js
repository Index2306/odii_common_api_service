/* eslint-disable consistent-return */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
const moment = require('moment')
const csv = require('csvtojson')
const Product = require('../models/product')
const ProductVariation = require('../models/product-variation')
const ProductImage = require('../models/product-image')
const ProductCategory = require('../models/product-category')
const ProductInventoryHistory = require('../models/product-inventory-history')
// Import Product

const AuditLog = require('../models/audit-log')
const CommonUtil = require('../utils/common.util')
const { knex } = require('../connections/pg-general')
const { removeEmpty } = require('../utils/common.util')
const { redisClient } = require('../connections/redis-cache')
const { pushMessage } = require('./onesignal.service')
const { ADMIN_URL } = require('../config')
const {
    ODII_PRICE_EXT,
    MAD_PRICE,
    STATUS,
    PRODUCT_PUBLISH_STATUS,
    HEADER_PRODUCT,
    DISCOUNT,
    INVENTORY_CHANGE_TYPE,
} = require('../constants')

exports.supplierCreateProduct = async (
    user,
    {
        variations,
        product_category_id,
        product_images_ids,
        product_categories_metadata,
        attributes,
        ...value
    }
) => {
    const productCategories = await ProductCategory.getTopCategoryForProduct(
        product_category_id,
        false
    )

    if (!_.isEmpty(productCategories)) {
        value.product_category_id = product_category_id
        value.top_category = productCategories[productCategories.length - 1]?.id
        value.product_categories_array = JSON.stringify(
            productCategories.map((item) => item.id)
        )
        value.product_categories_metadata = JSON.stringify(
            productCategories.map((item) => ({ id: item.id, name: item.name }))
        )
    }

    if (!_.isEmpty(product_categories_metadata)) {
        value.product_categories_metadata = JSON.stringify(
            product_categories_metadata
        )
    }

    if (!_.isEmpty(attributes)) {
        value.attributes = JSON.stringify(attributes)
    }

    if (!variations || !variations[0]) throw new Error('variation_not_found')

    const result = await knex.transaction(async (trx) => {
        const [productId] = await Product.insert(value, { trx })
        if (!productId) throw new Error('create_product_fail')
        if (!_.isEmpty(product_images_ids))
            await ProductImage.updateProductImageByIds(product_images_ids, {
                is_deleted: false,
                product_id: productId,
            })
        const [thumbProductImageId] =
            await ProductImage.insertThumbToProductImage(
                productId,
                value.thumb,
                user
            )

        const [sizeChartProductImageId] = await ProductImage.insertSizeChartToProductImage(
            productId,
            value.size_chart,
            user
        )

        console.log(sizeChartProductImageId)

        if (value.has_variation === false) {
            const bodyDefaultVariation = variations[0]
            if (
                !bodyDefaultVariation.product_image_id &&
                !_.isEmpty(product_images_ids) &&
                product_images_ids.length > 0
            ) {
                bodyDefaultVariation.product_image_id =
                    product_images_ids[product_images_ids.length - 1]
            }
            if (!bodyDefaultVariation.product_image_id && thumbProductImageId) {
                bodyDefaultVariation.product_image_id = thumbProductImageId
            }
            await ProductVariation.upsertProductVariations(
                [
                    removeEmpty({
                        ...bodyDefaultVariation,
                        ...{ id: undefined },
                        product_id: productId,
                        is_default: true,
                        barcode: CommonUtil.getBarcode(),
                        sku: value.sku || CommonUtil.getProductSKU(),
                    }),
                ],
                { trx }
            )
            await Product.updateById(
                productId,
                {
                    number_of_variation: 0,
                    has_variation: false,
                    total_quantity: bodyDefaultVariation.total_quantity,

                    min_price_variation:
                        bodyDefaultVariation.origin_supplier_price,
                    max_price_variation:
                        bodyDefaultVariation.origin_supplier_price,
                },
                { trx }
            )
            // insert inventory history
            // await ProductInventoryHistory.insertHistory({
            //     user_id: user.id,
            //     // id: auto gen
            //     product_id: productId,
            //     origin_value: 0,
            //     next_value: bodyDefaultVariation.total_quantity,
            //     change_value: bodyDefaultVariation.total_quantity,
            //     change_type: INVENTORY_CHANGE_TYPE.ADD,
            //     change_description: 'Khởi tạo',
            // })

            return { product_id: productId, number_of_variation: 0 }
        }

        // number_of_variation
        if (value.has_variation === true) {
            let minVariationPrice = MAD_PRICE
            let maxVariationPrice = 0
            // let totalQuantity = 0
            let index = 0
            const variationsData = variations.map((variation) => {
                index += 1
                variation.product_id = productId
                // totalQuantity += variation.total_quantity
                if (
                    !variation.product_image_id &&
                    !_.isEmpty(product_images_ids) &&
                    product_images_ids.length > 0
                ) {
                    variation.product_image_id =
                        product_images_ids[product_images_ids.length - 1]
                }
                if (!variation.product_image_id && thumbProductImageId) {
                    variation.product_image_id = thumbProductImageId
                }
                if (!variation.id) {
                    variation.barcode = CommonUtil.getBarcode()
                    variation.sku = `${value.sku}-${index}`
                }

                if (!variation.barcode) {
                    variation.barcode = CommonUtil.getBarcode()
                }

                if (!variation.sku) {
                    variation.sku = CommonUtil.getProductSKU()
                }
                if (variation.variation_index)
                    variation.variation_index = JSON.stringify(
                        variation.variation_index
                    )

                if (variation.origin_supplier_price < minVariationPrice) {
                    minVariationPrice = variation.origin_supplier_price
                }
                if (variation.origin_supplier_price > maxVariationPrice) {
                    maxVariationPrice = variation.origin_supplier_price
                }

                return variation
            })
            const insertVariationsResult =
                await ProductVariation.upsertProductVariations(variationsData, {
                    trx,
                })

            if (insertVariationsResult[0] === 0)
                throw new Error('insert_variation_fail')
            const detailHistory = variationsData.map((item) => ({
                variation_sku: item.sku,
                origin_value: 0,
                next_value: item.total_quantity,
                change_value: item.total_quantity,
                change_type: INVENTORY_CHANGE_TYPE.ADD,
                change_description: 'Khởi tạo',
            }))
            await Product.updateById(
                productId,
                {
                    number_of_variation: variationsData.length,
                    min_price_variation: minVariationPrice,
                    max_price_variation: maxVariationPrice,
                    // total_quantity: totalQuantity,
                    has_variation: true,
                },
                { trx }
            )
            // insert inventory history
            // await ProductInventoryHistory.insertHistory({
            //     user_id: user.id,
            //     // id: auto gen
            //     product_id: productId,
            //     origin_value: 0,
            //     next_value: totalQuantity,
            //     change_value: totalQuantity,
            //     change_type: INVENTORY_CHANGE_TYPE.ADD,
            //     change_description: 'Khởi tạo',
            //     change_detail: JSON.stringify(detailHistory),
            // })

            return {
                product_id: productId,
                number_of_variation: variationsData.length,
                variations: insertVariationsResult,
            }
        }
    })

    // notification for admin
    const options = {
        message: 'Có sản phẩm cần duyệt này',
        segment: 'Admin',
        url: `${ADMIN_URL}/products`,
    }
    pushMessage(options)

    AuditLog.addProductLogAsync(result?.product_id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.CREATED,
        change_to_data: {
            number_of_variation: result?.number_of_variation,
            variations,
            ...value,
        },
    })

    return result
}
exports.updateProductQuantity = async (
    user,
    { id, total_quantity, variations },
    currentProduct,
    currentVariations
) => {
    if (currentProduct.id !== id) throw new Error('invalid_product_id')
    let nextTotalQuantity = total_quantity
    const historyDetail = []
    // calculate total product
    if (currentProduct.has_variation && currentVariations) {
        nextTotalQuantity = 0
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
        })
    }
    const result = knex.transaction(async (trx) => {
        if (currentProduct.has_variation && variations) {
            const variationQuery = variations.map((variation) =>
                ProductVariation.updateProductVariationQuantity(
                    variation.id,
                    variation.total_quantity,
                    { trx }
                )
            )
            await Promise.all(variationQuery)
            // update product total quantity
            if (nextTotalQuantity !== currentProduct.total_quantity) {
                const updateProductResult = await Product.updateById(
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
                        product_id: id,
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
        } else if (nextTotalQuantity !== currentProduct.total_quantity) {
            console.log('nextTotalQuantity', nextTotalQuantity)
            const updateProductResult = await Product.updateById(
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
                    product_id: id,
                    origin_value: currentProduct.total_quantity,
                    next_value: nextTotalQuantity,
                    change_value:
                        nextTotalQuantity - currentProduct.total_quantity,
                    change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                    change_description: 'Cập nhật tồn kho',
                },
                { trx }
            )
        }
    })

    return result
}
exports.updateProduct = async (
    user,
    {
        variations,
        id,
        product_images_ids,
        product_categories_metadata,
        attributes,
        ...body
    },
    currentProduct
) => {
    const result = await knex.transaction(async (trx) => {
        if (!_.isEmpty(body.tags)) body.tags = JSON.stringify(body.tags)

        const productCategories =
            await ProductCategory.getTopCategoryForProduct(
                body.product_category_id,
                false
            )

        if (!_.isEmpty(productCategories)) {
            body.top_category =
                productCategories[productCategories.length - 1]?.id
            body.product_categories_array = JSON.stringify(
                productCategories.map((item) => item.id)
            )
            body.product_categories_metadata = JSON.stringify(
                productCategories.map((item) => ({
                    id: item.id,
                    name: item.name,
                }))
            )
        }

        if (!_.isEmpty(attributes)) {
            body.attributes = JSON.stringify(attributes)
        }

        if (body.has_variation === false) {
            body.number_of_variation = 0
        }

        if (
            body.has_variation === false &&
            currentProduct.has_variation === true
        ) {
            // todo: inactive tất cả variation cũ
            await ProductVariation.inactiveProductVariationByProducId(id, {
                trx,
            })
        }

        const variationIds = variations.filter((i) => !!i.id).map((i) => i.id)

        const variationsInDB =
            await ProductVariation.getProductVariationsByIdsAndProductId({
                ids: variationIds,
                product_id: id,
            })

        if (variationIds.length !== variationsInDB.length) {
            throw new Error('invalid_variation_id')
        }

        let thumbProductImageId
        let sizeChartProductImageId
        if (
            body.thumb &&
            body.thumb?.location != currentProduct.thumb?.location
        ) {
            thumbProductImageId = await ProductImage.updateThumbToProductImage(
                id,
                body.thumb,
                user
            )
        }

        if (
            body.size_chart &&
            body.size_chart?.location != currentProduct.size_chart?.location
        ) {
            sizeChartProductImageId = await ProductImage.insertSizeChartToProductImage(
                id,
                body.size_chart,
                user
            )
        }

        // TODO: update product variations
        let minVariationPrice = MAD_PRICE
        let maxVariationPrice = 0
        let totalQuantity = 0
        const historyDetail = []
        const variationsUpdateData = variations.map((variation) => {
            variation.product_id = id
            variation.is_default = !body.has_variation
            if (!variation.product_image_id && thumbProductImageId) {
                variation.product_image_id = thumbProductImageId
            }

            if (variation.id) variation.id = variation.id.toString()

            if (!variation.id) {
                variation.barcode = CommonUtil.getBarcode()
                variation.sku = CommonUtil.getProductSKU()
            }

            if (!variation.barcode) {
                variation.barcode = CommonUtil.getBarcode()
            }

            if (!variation.sku) {
                variation.sku = CommonUtil.getProductSKU()
            }

            if (variation.variation_index)
                variation.variation_index = JSON.stringify(
                    variation.variation_index
                )

            if (variation.total_quantity)
                totalQuantity += variation.total_quantity

            if (
                variation.origin_supplier_price &&
                variation.origin_supplier_price < minVariationPrice
            ) {
                minVariationPrice = variation.origin_supplier_price
            }
            if (
                variation.origin_supplier_price &&
                variation.origin_supplier_price > maxVariationPrice
            ) {
                maxVariationPrice = variation.origin_supplier_price
            }
            const existedVari =
                variationsInDB == null
                    ? null
                    : variationsInDB.find((item) => item.id === variation.id)
            let orgValue = 0
            if (existedVari) {
                orgValue = existedVari.total_quantity
            }
            if (orgValue !== variation.total_quantity) {
                historyDetail.push({
                    variation_sku: variation.sku,
                    origin_value: orgValue,
                    next_value: variation.total_quantity,
                    change_value: variation.total_quantity - orgValue,
                    change_type: existedVari
                        ? INVENTORY_CHANGE_TYPE.UPDATE
                        : INVENTORY_CHANGE_TYPE.ADD,
                    change_description: existedVari
                        ? 'Cập nhật tồn kho'
                        : 'Khởi tạo',
                })
            }

            return variation
        })

        await ProductVariation.upsertProductVariations(variationsUpdateData, {
            trx,
        })

        const updateProductResult = await Product.updateById(
            id,
            {
                ...body,
                // eslint-disable-next-line prettier/prettier
                number_of_variation: (body.has_variation === true ? variationsUpdateData.length : 0),
                ...(minVariationPrice !== MAD_PRICE && {
                    min_price_variation: minVariationPrice,
                }),
                ...(maxVariationPrice !== 0 && {
                    max_price_variation: maxVariationPrice,
                }),
                ...(totalQuantity !== 0 && { total_quantity: totalQuantity }),
            },
            {
                trx,
            }
        )

        if (body.number_of_visits) {
            const redisKey = `product_detail_${id}`
            await redisClient.set(redisKey, body.number_of_visits * 1)
        }

        // TODO: update product image
        if (product_images_ids)
            await updateProductImages(currentProduct, product_images_ids, {
                trx,
            })

        // update inventory history
        if (
            totalQuantity !== 0 &&
            currentProduct.total_quantity !== totalQuantity
        ) {
            await ProductInventoryHistory.insertHistory({
                user_id: user.id,
                // id: auto gen
                product_id: id,
                origin_value: currentProduct.total_quantity,
                next_value: totalQuantity,
                change_value: totalQuantity - currentProduct.total_quantity,
                change_type: INVENTORY_CHANGE_TYPE.UPDATE,
                change_description: 'Cập nhật tồn kho',
                change_detail: JSON.stringify(historyDetail),
            })
        }

        return {
            id,
        }
    })
    // notification for admin
    const options = {
        message: 'Có sản phẩm mới được chỉnh sửa cần duyệt này',
        segment: 'Admin',
        url: `${ADMIN_URL}/products`,
    }
    pushMessage(options)

    AuditLog.addProductLogAsync(currentProduct.id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        current_data: currentProduct,
        change_to_data: { id, product_images_ids, variations, ...body },
    })

    return result
}

exports.updateProductState = async (
    user,
    { id, publish_status, status },
    currentProduct
) => {
    if (currentProduct.id !== id) throw new Error('invalid_product_id')
    if (currentProduct.publish_status === publish_status) return currentProduct
    const updateProductResult = await Product.updateById(id, {
        publish_status,
        status,
    })
    AuditLog.addProductLogAsync(currentProduct.id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        current_data: currentProduct,
        change_to_data: { ...currentProduct, publish_status, status },
    })

    return updateProductResult
}

const updateProductImages = async (
    currentProduct,
    product_images_ids,
    { trx } = {}
) => {
    const currentProductImageIds = currentProduct.product_images
        ?.filter((img) => !img?.is_thumb)
        .map((image) => image.id.toString())
    const imageIdsDelete = _.difference(
        currentProductImageIds,
        product_images_ids
    )

    const imageIdsAdd = _.difference(product_images_ids, currentProductImageIds)

    if (!_.isEmpty(imageIdsDelete)) {
        await ProductImage.updateProductImageByIds(imageIdsDelete, {
            is_deleted: true,
        })
    }

    if (!_.isEmpty(imageIdsAdd)) {
        await ProductImage.updateProductImageByIds(imageIdsAdd, {
            is_deleted: false,
            product_id: currentProduct.id,
        })
    }
}

exports.productInWarehousing = async (supplier_warehousing_id) => {
    const [countProduct, countInactiveProduct] = await Promise.all([
        Product.countProductFromWareHousingId(supplier_warehousing_id),
        Product.countInactiveProductFromWareHousingId(supplier_warehousing_id),
    ])

    return {
        countProduct: countProduct.count,
        countInactiveProduct: countInactiveProduct.count,
    }
}
exports.productClone = async (id) => {
    const product = await Product.getOneById(id)
    if (!product) throw new Error('product_not_found')
    await Product.cloneProduct(id)

    return true
}
exports.convertProductData = async (dataFile) => {
    const buffer = await dataFile.toBuffer()
    const arrayDataCsv = await csv({
        noheader: true,
        output: 'csv',
    }).fromString(buffer.toString())
    const newArray = arrayDataCsv.map((item) => item.toString().split(';'))
    let keyArray = newArray.shift()

    keyArray = [
        HEADER_PRODUCT.HANDLE,
        HEADER_PRODUCT.NAME,
        HEADER_PRODUCT.DESCRIPTION,
        HEADER_PRODUCT.VENDOR,
        HEADER_PRODUCT.CATEGORIES,
        HEADER_PRODUCT.TAGS,
        HEADER_PRODUCT.OPTION_1_NAME,
        HEADER_PRODUCT.OPTION_1_VALUE,
        HEADER_PRODUCT.OPTION_2_NAME,
        HEADER_PRODUCT.OPTION_2_VALUE,
        HEADER_PRODUCT.OPTION_3_NAME,
        HEADER_PRODUCT.OPTION_3_VALUE,
        HEADER_PRODUCT.SKU,
        HEADER_PRODUCT.CURRENCY_CODE,
        HEADER_PRODUCT.ORIGIN_SUPPLIER_PRICE,
        HEADER_PRODUCT.HIGH_RETAIL_PRICE,
        HEADER_PRODUCT.LOW_RETAIL_PRICE,
        HEADER_PRODUCT.TOTAL_QUANTITY,
        HEADER_PRODUCT.BARCODE,
        HEADER_PRODUCT.VARIANT_IMAGE,
        HEADER_PRODUCT.WEIGHT_GRAMS,
        HEADER_PRODUCT.STATUS,
        HEADER_PRODUCT.WAREHOUSING_ID,
        HEADER_PRODUCT.PRODUCT_IMAGE_IDS,
    ]

    const data = newArray.map((item) => {
        const obj = {}
        // eslint-disable-next-line no-return-assign
        item.map((x, index) => (obj[keyArray[index]] = x))

        return obj
    })

    return data
}
exports.fillProductVariation = async (product) => {
    const result = _.chain(product)
        .groupBy(HEADER_PRODUCT.HANDLE)
        .toPairs()
        .map((pair) => _.zipObject(['handle', 'variations'], pair))
        .value()

    return result
}

exports.mappingProductDiscount = (products) => {
    const result = products.map(
        (product, index) =>
            // if (!_.isEmpty(product.product_discount_metadata)) {
            handleDiscount(product)
        // }
    )

    return result
}

const handleDiscount = (product) => {
    const PRICE = Number(product.min_price_variation)

    let totalDiscount = 0

    if (!_.isEmpty(product.product_discount_metadata)) {
        product.product_discount_metadata.map((item) => {
            if (compareTime(item.from_time, item.to_time)) {
                if (item.type === DISCOUNT.CASH) {
                    totalDiscount += Number(item.amount)
                }
                if (item.type === DISCOUNT.PERCENT) {
                    totalDiscount += PRICE * Number(item.amount) * 0.01
                }
            }
        })
    }

    return { ...product, promotional_price: PRICE - totalDiscount }
}

const compareTime = (from_time, to_time) => {
    const timeNow = moment().format()?.valueOf()
    if (timeNow >= from_time?.valueOf() && timeNow <= to_time?.valueOf()) {
        return true
    }

    return false
}
