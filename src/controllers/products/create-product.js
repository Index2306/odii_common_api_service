/* eslint-disable new-cap */
const Joi = require('joi')
const _ = require('lodash')
const { minBy, maxBy } = require('lodash')
const Product = require('../../models/product')
const Category = require('../../models/product-category')
const ProductService = require('../../services/product')
const Supplier = require('../../models/supplier')
const { parseOption } = require('../../utils/pagination')
const {
    STATUS,
    ODII_PRICE_EXT,
    PRODUCT_PUBLISH_STATUS,
} = require('../../constants')
const { getProductSKU } = require('../../utils/common.util')
const AppError = require('../../utils/app-error')

exports.createProduct = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            name: Joi.string().required(),
            sku: Joi.string(),
            description: Joi.string(),
            short_description: Joi.string().allow(null).optional(),
            short_desc: Joi.string(),
            vendor: Joi.string(),
            barcode: Joi.string(),
            // total_quantity: Joi.number().integer(),
            has_variation: Joi.boolean().default(false).optional(),
            option_1: Joi.string().allow(null),
            option_2: Joi.string().allow(null),
            option_3: Joi.string().allow(null),

            status: Joi.string()
                .allow(STATUS.INACTIVE, null)
                .only()
                .default(STATUS.INACTIVE),

            publish_status: Joi.string()
                .allow(
                    PRODUCT_PUBLISH_STATUS.INACTIVE,
                    PRODUCT_PUBLISH_STATUS.PENDING_FOR_REVIEW,
                    null
                )
                .only()
                .required(),

            origin_supplier_price: Joi.number(),
            high_retail_price: Joi.number(),
            low_retail_price: Joi.number(),
            recommend_retail_price: Joi.number(),
            low_quantity_thres: Joi.number(),
            // supplier_warehousing_id: Joi.string().required(),
            // supplier_warehouse_return_id: Joi.string(),
            product_source_id: Joi.number(),
            product_images_ids: Joi.array()
                .items(Joi.string())
                .min(1)
                .required(),

            thumb: Joi.object().required(),
            size_chart: Joi.object().allow(null),
            detail: Joi.object().allow(null),
            tags: Joi.array()
                .items(Joi.string().min(2))
                .allow(null)
                // .default([])
                .max(10),
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

            variations: Joi.array()
                .items(
                    Joi.object().keys({
                        sku: Joi.string().optional(),
                        barcode: Joi.string().optional(),
                        name: Joi.string().optional(),
                        product_image_id: Joi.string().optional(),
                        position: Joi.number()
                            .allow(null)
                            .default(99)
                            .optional(),
                        attributes: Joi.array(),

                        origin_supplier_price: Joi.number().required(),
                        high_retail_price: Joi.number(),
                        low_retail_price: Joi.number(),
                        recommend_retail_price: Joi.number(),
                        // total_quantity: Joi.number().required(),
                        low_quantity_thres: Joi.number(),
                        weight_grams: Joi.number()
                            .integer()
                            .min(1)
                            .max(1000000)
                            .required(),
                        box_width_cm: Joi.number()
                            .integer()
                            .min(1)
                            .max(1000000)
                            .required(),
                        box_height_cm: Joi.number()
                            .integer()
                            .min(1)
                            .max(1000000)
                            .required(),
                        box_length_cm: Joi.number()
                            .integer()
                            .min(1)
                            .max(1000000)
                            .required(),

                        option_1: Joi.string().optional(),
                        option_2: Joi.string().optional(),
                        option_3: Joi.string().optional(),
                        variation_index: Joi.array().allow(null).optional(),
                    })
                )
                .required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    if (!_.isEmpty(value.tags)) value.tags = JSON.stringify(value.tags)
    // 1 partner 1 supplier
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) throw new Error('invalid_supplier')
    value.partner_id = user.partner_id
    value.supplier_id = supplier.id
    value.odii_price = value.origin_supplier_price * ODII_PRICE_EXT
    if (!value.sku) value.sku = getProductSKU()
    // value.status = STATUS.INACTIVE
    // value.publish_status = PRODUCT_PUBLISH_STATUS.PENDING_FOR_REVIEW

    if (!_.isEmpty(value.variations) && value.variations.length > 1) {
        const productOptions = _.compact([
            value.option_1,
            value.option_2,
            value.option_3,
        ])
        if (_.isEmpty(productOptions))
            throw new AppError('invalid_option_name', {
                message: 'Chưa set giá trị tên thuộc tính',
            })
    }

    // TODO: Check attributes by category_selected
    // TODO: check lazada
    const selectedCat = await Category.getCategoryById(
        value.product_category_id
    )

    if (!selectedCat) throw new Error('category_id_not_found')
    if (
        value.has_variation &&
        value.variations &&
        value.variations.length > 0
    ) {
        value.min_recommend_variation_price = minBy(
            value.variations,
            'recommend_retail_price'
        )?.recommend_retail_price
        value.max_recommend_variation_price = maxBy(
            value.variations,
            'recommend_retail_price'
        )?.recommend_retail_price
    }
    if (user.tenant_id) {
        value.tenant_id = user.tenant_id
    }
    const data = await ProductService.supplierCreateProduct(user, value)

    return {
        is_success: true,
        data,
    }
}

exports.getProductsSellerImport = async (request) => {
    const { user } = request

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.is_seller_import_list = true
    option.is_odii_listing = true

    const data = await Product.getProductListingV2(option, request.query)

    return {
        is_success: true,
        ...data,
    }
}

exports.cloneProduct = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    console.log('clone product', id)
    const isSuccess = await ProductService.productClone(id)

    return {
        is_success: isSuccess,
    }
}
