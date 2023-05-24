/* eslint-disable new-cap */
const Joi = require('joi')
const bufferImageSize = require('buffer-image-size')
const _ = require('lodash')
const { minBy, maxBy } = require('lodash')
const Product = require('../../models/product')
const ProductVariation = require('../../models/product-variation')
const Category = require('../../models/product-category')
const User = require('../../models/user')
const ProductService = require('../../services/product')
const NotificationService = require('../../services/notification')
const ProductImage = require('../../models/product-image')
const StoreProductImage = require('../../models/store-product-image')
const {
    STATUS_ARR,
    STATUS,
    PRODUCT_PUBLISH_STATUS,
    PRODUCT_PUBLISH_STATUS_ARR,
} = require('../../constants')
const {
    PRODUCT_STATUS,
    PRODUCT_STATUS_MAP,
} = require('../../constants/oms-status')
const { getProductSKU } = require('../../utils/common.util')
const { uploadFileToS3 } = require('../../services/file-library')

exports.supUpdateProductPublishState = async (request) => {
    const { user } = request
    const { id, publish_status } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            publish_status: Joi.string()
                .only()
                .allow('pending_for_review', 'inactive')
                .required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await Product.getProductDetailOnly(id, {
        partner_id: user.partner_id,
    })

    if (!currentProduct) throw new Error('NOT_FOUND')
    const payload = { id, publish_status, status: currentProduct.status }
    if (
        publish_status === 'pending_for_review' &&
        currentProduct.status === 'active'
    ) {
        payload.status = 'inactive'
    }
    const data = await ProductService.updateProductState(
        user,
        payload,
        currentProduct
    )

    return {
        is_success: true,
        data,
    }
}

exports.supUpdateProductQuantity = async (request) => {
    const { user } = request
    const { id, total_quantity, variations } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            total_quantity: Joi.number().optional(),
            variations: Joi.array().items(Joi.object()).allow(null).default([]),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await Product.getProductDetailOnly(id, {
        partner_id: user.partner_id,
    })

    if (!currentProduct) throw new Error('NOT_FOUND')
    const currentVariations =
        await ProductVariation.getProductVariationsByProductId(id)
    const data = await ProductService.updateProductQuantity(
        user,
        {
            id,
            total_quantity,
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
exports.supUpdateProduct = async (request) => {
    console.log('run supUpdateProduct')
    const { user } = request
    const { id, product_images_ids, variations, ...body } = await Joi.object()
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
            size_chart: Joi.object().allow(null),
            sku: Joi.string().allow(null).optional(),
            barcode: Joi.string().allow(null).optional(),
            // total_quantity: Joi.number().optional(),
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
            // supplier_warehousing_id: Joi.string().required(),
            // supplier_warehouse_return_id: Joi.string(),
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
                    // total_quantity: Joi.number().optional(),
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

    const currentProduct = await Product.getProductDetailOnly(id, {
        partner_id: user.partner_id,
    })

    if (!currentProduct) throw new Error('NOT_FOUND')

    if (body.publish_status === PRODUCT_PUBLISH_STATUS.PENDING_FOR_REVIEW)
        body.status = STATUS.INACTIVE

    if (!body.sku) body.sku = getProductSKU()

    // TODO: Check attributes by category_selected
    // TODO: check lazada
    // console.log('body.product_category_id = ', body.product_category_id)
    const selectedCat = await Category.getCategoryById(body.product_category_id)

    if (!selectedCat) throw new Error('category_id_not_found')
    if (body.has_variation && variations && variations.length > 0) {
        body.min_recommend_variation_price = minBy(
            variations,
            'recommend_retail_price'
        ).recommend_retail_price
        body.max_recommend_variation_price = maxBy(
            variations,
            'recommend_retail_price'
        ).recommend_retail_price
        console.log('body', body)
    }
    // const lazadaAttrOfCat = await Category.getStoreCatAttr({
    //     category_id: selectedCat.store_cat_id,
    // })

    // const productAttrs = body.attributes

    // const productOptions = _.compact([
    //     body.option_1,
    //     body.option_2,
    //     body.option_3,
    // ])
    // const lazadaAttrs = lazadaAttrOfCat.attributes

    // 1. get all variation multi attrs
    // const variationMultiAttrRequire = lazadaAttrs.filter(
    //     (attr) =>
    //         attr.is_mandatory === 1 &&
    //         attr.is_sale_prop === 1 &&
    //         attr.attribute_type === 'sku' &&
    //         attr.input_type === 'multiSelect'
    // )

    // console.log('productOptions len = ', productOptions.length)
    // console.log('variationMultiAttr len = ', variationMultiAttrRequire.length)

    // if (!_.isEmpty(variationMultiAttrRequire) && _.isEmpty(productOptions)) {
    //     throw new Error(
    //         `this_cat_need_attr_${variationMultiAttrRequire
    //             .map((attr) => attr.name)
    //             .join('&')}`
    //     )
    // }

    // if (
    //     !_.isEmpty(variationMultiAttrRequire) &&
    //     productOptions.length !== variationMultiAttrRequire.length
    // ) {
    //     throw new Error(
    //         `this_cat_need_attr_${variationMultiAttrRequire
    //             .map((attr) => attr.name)
    //             .join('&')}`
    //     )
    // }

    // 2. check những optional variation multi attrs
    // const variationMultiAttrNonRequire = lazadaAttrs.filter(
    //     (attr) =>
    //         attr.is_mandatory === 0 &&
    //         attr.is_sale_prop === 1 &&
    //         attr.attribute_type === 'sku' &&
    //         attr.input_type === 'multiSelect'
    // )
    // console.log('variationMultiAttrNonRequire ', variationMultiAttrNonRequire)

    // if (productOptions.includes('Màu sắc')) {
    //     const foo = _.find(variationMultiAttrNonRequire, {
    //         name: 'color_family',
    //     })
    //     if (!foo) throw new Error('invalid_option__color_family')
    // }

    // if (productOptions.includes('Kích thước')) {
    //     const foo = _.find(variationMultiAttrNonRequire, {
    //         name: 'size',
    //     })
    //     const bar = _.find(variationMultiAttrNonRequire, {
    //         name: 'Size',
    //     })
    //     if (!foo && !bar) throw new Error('invalid_option__size')
    // }

    // 2. check những optional variation  attrs
    // const variationAttrNonMultiNonRequire = lazadaAttrs.filter(
    //     (attr) =>
    //         attr.is_mandatory === 0 &&
    //         attr.is_sale_prop === 1 &&
    //         attr.attribute_type === 'sku'
    // )
    // console.log('variationAttrNonRequire ', variationAttrNonMultiNonRequire)
    // productAttrs
    // const myProductAttrNonMulti = productAttrs.filter(
    //     (attr) =>
    //         attr.input_type !== 'multiSelect' &&
    //         attr.is_sale_prop !== 1 &&
    //         attr.attribute_type !== 'sku'
    // )
    // console.log('myProductAttrNonMulti ', myProductAttrNonMulti)

    // Lọc ra attribute của variation
    // productAttrs
    // const myVariationAttrNonMulti = productAttrs.filter(
    //     (attr) =>
    //         attr.input_type !== 'multiSelect' &&
    //         attr.is_sale_prop === 1 &&
    //         attr.attribute_type === 'sku'
    // )
    // console.log('myVariationAttrNonMulti ', myVariationAttrNonMulti)

    // console.log('555')
    const data = await ProductService.updateProduct(
        user,
        {
            variations,
            id,
            product_images_ids,
            ...body,
        },
        currentProduct
    )

    return {
        is_success: true,
        data,
    }
}

exports.adminUpdateProduct = async (request) => {
    console.log('run adminUpdateProduct')
    const { user } = request
    const { id, product_images_ids, variations, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),

            is_deleted: Joi.boolean(),
            odii_price: Joi.number().optional(),
            odii_compare_price: Joi.number().optional(),
            number_of_visits: Joi.number().optional(),
            number_of_booking: Joi.number().optional(),
            rating: Joi.number().optional(),
            number_of_vote: Joi.number().optional(),
            attributes: Joi.array(),
            status: Joi.string()
                .allow(...STATUS_ARR)
                .optional(),
            publish_status: Joi.string()
                .allow(...PRODUCT_PUBLISH_STATUS_ARR)
                .only()
                .optional(),
            has_variation: Joi.boolean().required(),
            variations: Joi.array().items(
                Joi.object().keys({
                    id: Joi.string().optional(),
                    barcode: Joi.string().allow(null).optional(),
                    status: Joi.string()
                        .allow(...STATUS_ARR)
                        .only()
                        .optional(),
                    odii_price: Joi.number().optional(),
                    odii_compare_price: Joi.number().optional(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const currentProduct = await Product.getProductDetailOnly(id)
    console.log(
        '🚀 ~ file: update-product.js ~ line 298 ~ exports.adminUpdateProduct= ~ currentProduct',
        currentProduct
    )
    if (!currentProduct) throw new Error('NOT_FOUND')

    const data = await ProductService.updateProduct(
        user,
        { variations, id, product_images_ids, ...body },
        currentProduct
    )

    const detailProduct = await Product.getOneById(id)

    if (!detailProduct) throw new Error('NOT_FOUND')

    const users = await User.getUserPartner(detailProduct.partner_id)

    const userIds = users.filter((i) => !!i.id).map((i) => i.id)

    if (
        (body.status === STATUS.ACTIVE &&
            body.status !== detailProduct.status &&
            body.publish_status === PRODUCT_PUBLISH_STATUS.ACTIVE &&
            body.publish_status !== detailProduct.publish_status) ||
        (body.publish_status === PRODUCT_PUBLISH_STATUS.REJECTED) !==
            detailProduct.publish_status
    ) {
        NotificationService.sendMessage(user.id, {
            type: 'product',
            status: body.status,
            partner_id: detailProduct.partner_id,
            arrReceiver: userIds,
            source: 'supplier',
            metadata: {
                status: body.status,
            },
            content: `Bạn có sản phẩm #${id} vừa được ${body.status} `,
            data_id: id,
        })
    }

    return {
        is_success: true,
        data,
    }
}

exports.uploadProductImage = async (req) => {
    const { user } = req
    const data = await req.file()

    if (!data.mimetype.includes('image')) throw new Error('invalid_file_type')

    const buffer = await data.toBuffer()
    const dimension = bufferImageSize(buffer)

    const s3Data = await uploadFileToS3({
        name: data.filename,
        buffer,
        contentType: data.mimetype,
    })
    if (!s3Data || !s3Data.Key) throw new Error('UPLOAD_FAIL')

    const productImageBody = {
        partner_id: user.partner_id,
        location: s3Data.Key,
        width: dimension.width,
        height: dimension.height,
        name: data.filename,
        source: req?.odii_source,
        product_id: req?.query?.product_id,
    }
    const [productImageId] = await ProductImage.insertProductImage(
        productImageBody
    )

    return {
        is_success: true,
        data: {
            id: productImageId,
            origin: s3Data.Location,
            ...productImageBody,
        },
    }
}

exports.uploadStoreProductImage = async (req) => {
    const { user } = req
    const data = await req.file()

    if (!data.mimetype.includes('image')) throw new Error('invalid_file_type')

    const buffer = await data.toBuffer()
    const dimension = bufferImageSize(buffer)

    const s3Data = await uploadFileToS3({
        name: data.filename,
        buffer,
        contentType: data.mimetype,
    })
    if (!s3Data || !s3Data.Key) throw new Error('UPLOAD_FAIL')
    if (!req?.query?.store_product_id)
        throw new Error('invalid__store_product_id')

    console.log('store_product_id = ', req?.query?.store_product_id)

    const productImageBody = {
        partner_id: user.partner_id,
        location: s3Data.Key,
        width: dimension.width,
        height: dimension.height,
        name: data.filename,
        source: req?.odii_source,
        store_product_id: req?.query?.store_product_id,
    }
    const [productImageId] = await StoreProductImage.insert(productImageBody)

    return {
        is_success: true,
        data: {
            id: productImageId,
            origin: s3Data.Location,
            ...productImageBody,
        },
    }
}

exports.editProductImage = async (req) => {
    const { user } = req

    const { is_save_new, product_id, product_image_id } = await Joi.object()
        .keys({
            product_id: Joi.string().required(),
            product_image_id: Joi.string().required(),
            is_save_new: Joi.boolean().default(false),
        })
        .validateAsync({ ...req.params, ...req.query }, { stripUnknown: true })

    const data = await req.file()

    if (!data.mimetype.includes('image')) throw new Error('invalid_file_type')

    const buffer = await data.toBuffer()
    const dimension = bufferImageSize(buffer)

    const s3Data = await uploadFileToS3({
        name: data.filename,
        buffer,
        contentType: data.mimetype,
    })
    if (!s3Data || !s3Data.Key) throw new Error('UPLOAD_FAIL')

    const productImageBody = {
        partner_id: user.partner_id,
        location: s3Data.Key,
        width: dimension.width,
        height: dimension.height,
        name: data.filename,
        source: req?.odii_source,
        product_id,
    }

    let productImageId = product_image_id
    if (is_save_new) {
        const [newProductImageId] = await ProductImage.insertProductImage(
            productImageBody
        )
        productImageId = newProductImageId
    } else {
        await ProductImage.update(
            {
                product_id,
                id: product_image_id,
            },
            productImageBody
        )
    }

    return {
        is_success: true,
        data: {
            product_id,
            id: productImageId,
            origin: s3Data.Location,
            ...productImageBody,
        },
    }
}

exports.supplierDeleteProduct = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const currentProduct = await Product.getProductDetailOnly(id, {
        partner_id: user.partner_id,
    })

    if (!currentProduct) throw new Error('NOT_FOUND')
    const drafStatus = PRODUCT_STATUS_MAP[PRODUCT_STATUS.DRAF]
    if (
        currentProduct.status !== drafStatus.status &&
        currentProduct.publish_status !== drafStatus.publish_status
    ) {
        throw new Error('NOT_ALLOW')
    }
    await Product.updateById(id, {
        is_deleted: true,
        updated_at: new Date().toISOString(),
    })

    return {
        is_success: true,
        product_id: id,
    }
}
