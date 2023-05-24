const Joi = require('joi')
const bufferImageSize = require('buffer-image-size')
const _ = require('lodash')
const { minBy, maxBy } = require('lodash')
const Product = require('../models/product')
const ProductStock = require('../models/product-stock')
const ProductStockService = require('../services/product-stock')
const ProductVariationStock = require('../models/product-variation-stock')
const { PRODUCT_PUBLISH_STATUS, STATUS_ARR } = require('../constants')

exports.UpdateProductStockState = async (request) => {
    const { user } = request
    const { id, supplier_status } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            supplier_status: Joi.string()
                .only()
                .allow('active', 'inactive')
                .required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await ProductStock.getOneById(id)
    if (!currentProduct) throw new Error('NOT_FOUND')

    if (currentProduct.total_quantity <= 0 && supplier_status === 'active') {
        throw new Error('Vui lòng thêm số lượng tồn kho')
    }

    const data = await ProductStock.updateById(id, {
        status: supplier_status,
    })

    return {
        is_success: true,
        data,
    }
}

exports.supUpdateProductStock = async (request) => {
    const { user } = request
    const { id, variations, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string().allow(null).optional(),
            description: Joi.string().allow(null).optional(),
            short_description: Joi.string().allow(null).optional(),
            vendor: Joi.string().allow(null).optional(),
            has_variation: Joi.boolean().required(),
            option_1: Joi.string().allow(null).optional(),
            option_2: Joi.string().allow(null).optional(),
            option_3: Joi.string().allow(null).optional(),
            tags: Joi.array().items(Joi.string().min(2)).allow(null).max(10),
            thumb: Joi.object().allow(null),
            sku: Joi.string().allow(null).optional(),
            barcode: Joi.string().allow(null).optional(),
            total_quantity: Joi.number().optional(),
            low_quantity_thres: Joi.number().optional(),
            high_retail_price: Joi.number().optional(),
            low_retail_price: Joi.number().optional(),
            recommend_retail_price: Joi.number().optional(),
            origin_supplier_price: Joi.number().optional(),
            product_images_ids: Joi.array()
                .items(Joi.string())
                .allow(null)
                .default([]),
            publish_status: Joi.string()
                .allow(
                    PRODUCT_PUBLISH_STATUS.INACTIVE,
                    PRODUCT_PUBLISH_STATUS.PENDING_FOR_REVIEW,
                    null
                )
                .only()
                .optional(),

            product_source_id: Joi.number().integer(),
            supplier_warehousing_id: Joi.string().required(),
            supplier_warehouse_return_id: Joi.string(),
            product_category_id: Joi.string().required(),
            product_categories_metadata: Joi.array()
                .items(
                    Joi.object().keys({
                        name: Joi.string(),
                        id: Joi.any(),
                    })
                )
                .allow(null)
                .max(5),
            attributes: Joi.array(),
            variations: Joi.array().items(
                Joi.object().keys({
                    id: Joi.string().optional(),
                    product_image_id: Joi.string().optional(),
                    product_stock_id: Joi.string().optional(),
                    product_image_id: Joi.string().optional(),
                    sku: Joi.string().allow(null).optional(),
                    barcode: Joi.string().allow(null).optional(),
                    name: Joi.string().allow(null).optional(),
                    position: Joi.number().allow(null).default(99).optional(),

                    status: Joi.string()
                        .allow(...STATUS_ARR)
                        .only()
                        .optional(),

                    attributes: Joi.array(),

                    origin_supplier_price: Joi.number().optional(),
                    high_retail_price: Joi.number().optional(),
                    low_retail_price: Joi.number().optional(),
                    recommend_retail_price: Joi.number().optional(),
                    total_quantity: Joi.number().optional(),
                    is_deleted: Joi.boolean().optional(),
                    low_quantity_thres: Joi.number(),
                    weight_grams: Joi.number()
                        .integer()
                        .min(1)
                        .max(1000000)
                        .optional(),
                    box_width_cm: Joi.number()
                        .integer()
                        .min(1)
                        .max(1000000)
                        .optional(),
                    box_height_cm: Joi.number()
                        .integer()
                        .min(1)
                        .max(1000000)
                        .optional(),
                    box_length_cm: Joi.number()
                        .integer()
                        .min(1)
                        .max(1000000)
                        .optional(),

                    option_1: Joi.string().allow(null).optional(),
                    option_2: Joi.string().allow(null).optional(),
                    option_3: Joi.string().allow(null).optional(),
                    variation_index: Joi.array().allow(null).optional(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await ProductStock.getOneById(id)

    if (!currentProduct) throw new Error('NOT_FOUND')

    const data = await ProductStockService.updateProductStock(
        user,
        {
            variations,
            id,
            ...body,
        },
        currentProduct
    )

    return {
        is_success: true,
        data,
    }
}

exports.supInsertProductStock = async (request) => {
    const { user } = request
    const { products, ...value } = await Joi.object()
        .keys({
            supplier_warehousing_id: Joi.string().required(),
            supplier_warehousing_return_id: Joi.string().allow(null),
            products: Joi.array().items().required()
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    await Promise.all(
        products.map(async (item) => {
            const existProductStock = await ProductStock.getOne({
                product_id: item,
                supplier_warehousing_id: value.supplier_warehousing_id
            })

            if (existProductStock) {
                const data = await Product.getOneById(item)
                throw new Error(`Kho lấy hàng đã tồn tại sản phẩm " ${data.name} "`)
            }
            return
        })
    )

    const data = ProductStockService.SupplierInsertProductStock(products, value, user.tenant_id)

    return {
        is_success: true,
        data,
    }
}

exports.supUpdateProductStockQuantity = async (request) => {
    const { user } = request
    const { id, total_quantity, real_quantity, variations } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            total_quantity: Joi.number().optional(),
            real_quantity: Joi.number().optional(),
            variations: Joi.array().items(Joi.object()).allow(null).default([]),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await ProductStock.getOneMapProductById(id)

    if (!currentProduct) throw new Error('NOT_FOUND')

    const currentVariations =
        await ProductVariationStock.getProductVariationsByProductStockId(id)

    const data = await ProductStockService.updateProductStockQuantity(
        user,
        {
            id,
            total_quantity,
            real_quantity,
            variations,
        },
        currentProduct,
        currentVariations
    )

    return {
        is_success: true,
        data,
    }
}