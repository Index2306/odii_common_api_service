/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable new-cap */
const Joi = require('joi')
const _ = require('lodash')
const Product = require('../../models/product')
const Supplier = require('../../models/supplier')
const ProductVariation = require('../../models/product-variation')
const ProductVariationStock = require('../../models/product-variation-stock')
const ProductImage = require('../../models/product-image')
const { parseOption } = require('../../utils/pagination')
const ProductService = require('../../services/product')
const PromotionCtl = require('../promotion')
const {
    STATUS,
    PRODUCT_PUBLISH_STATUS,
    ODII_PRICE_EXT,
    ROLES,
} = require('../../constants')
const SearchCtl = require('../../services/search')
const AuditLog = require('../../models/audit-log')

exports.sellerGetProductDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Product.getProductStockDetail(
        id,
        { status: STATUS.ACTIVE },
        { status: STATUS.ACTIVE }
    )

    data.product_images = data.product_images.filter((image) => !image.is_thumb && image.position !== 5)

    if (!_.isEmpty(data.variations)) {
        data.variations = data.variations.map((variation) => {
            if (!_.isEmpty(variation.promotion)) {
                const final_price = PromotionCtl.disCountFormula(
                    variation.promotion.origin_supplier_price,
                    variation?.promotion?.type?.includes('quantity_by')
                        ? variation.promotion.options[0].value
                        : variation.promotion.promotion_product.value,
                    1,
                    !!(
                        variation?.promotion?.type?.includes('quantity_by') ||
                        variation?.promotion?.promotion_product?.type?.includes(
                            'percent'
                        )
                    )
                )

                variation.promotion = {
                    id: variation.promotion.id,
                    finalPrice: final_price,
                    value: variation?.promotion?.type?.includes('quantity_by')
                        ? variation.promotion.options[0].value
                        : variation.promotion.promotion_product.value,
                    origin_supplier_price:
                        variation.promotion.origin_supplier_price,
                    type: variation.promotion.type,
                    typeOption: variation.promotion.promotion_product.type,
                    options: variation?.promotion?.options || [],
                    name: variation?.promotion?.name,
                    from_time: variation?.promotion?.from_time,
                    to_time: variation?.promotion?.to_time,
                }

                return variation
            }

            return variation
        })
    }

    return {
        is_success: true,
        data,
    }
}

exports.adminGetProductDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const option = {}
    const data = await Product.getProductDetail(id, option)
    data.product_images = data.product_images.filter((image) => !image.is_thumb && image.position !== 5)

    return {
        is_success: true,
        data,
    }
}

exports.supplierGetProductDetail = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const option = {}
    option.partner_id = user.partner_id
    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source = ROLES.PARTNER_SOURCE
    }
    const data = await Product.getProductDetail(id, option)
    data.product_images = data.product_images.filter((image) => !image.is_thumb && image.position !== 5)

    return {
        is_success: true,
        data,
    }
}

exports.supplierGetDistributionDetail = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const option = {}
    option.partner_id = user.partner_id
    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source = ROLES.PARTNER_SOURCE
    }
    const data = await Product.getProductStockDetail(id, option)
    data.product_images = data.product_images.filter((image) => !image.is_thumb && image.position !== 5)

    return {
        is_success: true,
        data,
    }
}

exports.adminGetProductVariationDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const option = {}
    const data = await ProductVariation.getProductVariationDetail(id, option)

    return {
        is_success: true,
        data,
    }
}

exports.getProductVariations = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await ProductVariation.getProductVariationsByProductId(id)

    return {
        is_success: true,
        data,
    }
}

exports.getProductImages = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await ProductImage.getProductImagesByProductId(id)

    return {
        is_success: true,
        data,
    }
}

const getProducts = async (request, option) => {
    const { user } = request
    if (request.query.filter_quantity)
        request.query.filter_quantity = _.isArray(request.query.filter_quantity)
            ? request.query.filter_quantity
            : [request.query.filter_quantity]

    if (request.query.filter_times_pushed)
        request.query.filter_times_pushed = _.isArray(
            request.query.filter_times_pushed
        )
            ? request.query.filter_times_pushed
            : [request.query.filter_times_pushed]

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            from_province_code: Joi.string(),
            from_province_id: Joi.string(),
            from_district_id: Joi.string(),
            status: Joi.string(),
            publish_status: Joi.string(),
            from_rating: Joi.number().integer(),
            to_rating: Joi.number().integer(),
            has_variation: Joi.boolean(),
            from_price: Joi.number().integer(),
            to_price: Joi.number().integer(),

            from_total_quantity: Joi.number().integer(),
            to_total_quantity: Joi.number().integer(),

            filter_quantity: Joi.array().items(
                Joi.string()
                    .allow('0-100', '100-500', '500-1000', '1000-max')
                    .only()
            ),

            filter_times_pushed: Joi.array().items(
                Joi.string()
                    .allow('0-500', '500-1000', '1000-2000', '2000-max')
                    .only()
            ),

            from_number_of_times_pushed: Joi.number().integer(),
            to_number_of_times_pushed: Joi.number().integer(),

            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
            supplier_warehouse_return_id: Joi.string(),
            product_source_id: Joi.number().integer(),
        })
        .validateAsync(_.omit(request.query, ['page', 'page_size']), {
            stripUnknown: false,
            allowUnknown: true,
        })

    if (query.filter_quantity)
        query.filter_quantity = query.filter_quantity.map((item) => {
            const [from, to] = item.split('-')

            return { from: from * 1, to: to * 1 || undefined }
        })

    if (query.filter_times_pushed)
        query.filter_times_pushed = query.filter_times_pushed.map((item) => {
            const [from, to] = item.split('-')

            return { from: from * 1, to: to * 1 || undefined }
        })

    option.tenant_id = user.tenant_id

    if (option.is_product_by_stock) {
        const data = await Product.getProductStockListing(option, query)

        return {
            is_success: true,
            ...data,
        }
    }

    const data = await Product.getProductListingV2(option, query)

    if (!_.isEmpty(data.data)) {
        data.data = data.data.map((product) => {
            let promotions = []
            if (!_.isEmpty(product.promotions)) {
                promotions = product.promotions.map((item) => {
                    const final_price = PromotionCtl.disCountFormula(
                        item.origin_supplier_price,
                        item.type.includes('quantity_by')
                            ? item.value
                            : item.promotion_product.value,
                        1,
                        !!(
                            item.type.includes('quantity_by') ||
                            item.promotion_product.type.includes('percent')
                        )
                    )

                    const promotion = {
                        id: item.id,
                        finalPrice: final_price,
                        value: item.type.includes('quantity_by')
                            ? item.value
                            : item.promotion_product.value,
                        origin_supplier_price: item.origin_supplier_price,
                        type: item.type,
                        typeOption: item.promotion_product.type,
                    }

                    return promotion
                })
            }

            return { ...product, promotions }
        })
    }

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetProducts = async (request) => {
    const option = parseOption(request.query)
    option.is_product_by_stock = true
    option.is_admin_listing = true

    return getProducts(request, option)
}

exports.supplierGetProducts = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.is_product_by_stock = true
    option.is_admin_listing = true
    option.partner_id = user.partner_id
    option.include_variation = true
    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }

    return getProducts(request, option)
}

exports.supplierGetDistributions = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.is_admin_listing = true
    option.partner_id = user.partner_id
    option.include_variation = true
    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }

    if (!_.isEmpty(request.query.warehousing)) {
        option.warehousing_id = request.query.warehousing
    }
    if (!_.isEmpty(request.query.product_stock_status)) {
        option.product_stock_status = request.query.product_stock_status
    }
    return getProducts(request, option)
}

exports.supplierGetImportDistributions = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.is_admin_listing = true
    option.partner_id = user.partner_id
    option.include_variation = true
    option.publish_status = 'active'
    option.product_stock_status = 'active'

    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }

    if (!_.isEmpty(request.query.warehousing)) {
        option.warehousing_id = request.query.warehousing
    }

    return getProducts(request, option)
}

exports.supplierGetImportProducts = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.is_product_by_stock = true
    option.is_admin_listing = true
    option.partner_id = user.partner_id
    option.include_variation = true
    option.publish_status = 'active'

    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }

    if (!_.isEmpty(request.query.warehousing)) {
        option.warehousing_id = request.query.warehousing
    }

    if (!_.isEmpty(request.query.not_warehouse_id)) {
        option.not_warehouse_id = request.query.not_warehouse_id
    }

    return getProducts(request, option)
}

exports.supplierGetProductVariations = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await ProductVariation.getProductVariationsByProductId(id)

    return {
        is_success: true,
        data,
    }
}

exports.supplierGetProductVariationsStock = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await ProductVariationStock.getProductVariationsByProductStockId(id)

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetProducts = async (request) => {
    const option = parseOption(request.query)
    option.status = STATUS.ACTIVE
    option.publish_status = PRODUCT_PUBLISH_STATUS.ACTIVE
    option.seller_listing = STATUS.ACTIVE

    return getProducts(request, option)
}

exports.supplierImportProductByCsv = async (request) => {
    const { user } = request
    const dataFile = await request.file()
    const arrayData = await ProductService.convertProductData(dataFile)

    const products = await ProductService.fillProductVariation(arrayData)

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) throw new Error('invalid_supplier')

    const productsForSave = []
    for (const product of products) {
        const productForSave = {
            name: product.handle,
            has_variation: true,
            supplier_id: supplier.id,
        }
        const productVariations = []
        // eslint-disable-next-line no-plusplus
        for (let index = 0; index < product.variations.length; index++) {
            const variation = product.variations[index]
            if (index === 0) {
                if (variation.option_1_name)
                    productForSave.option_1 = variation.option_1_name
                if (variation.option_2_name)
                    productForSave.option_2 = variation.option_2_name
                if (variation.option_3_name)
                    productForSave.option_3 = variation.option_3_name

                productForSave.description = variation.description
                productForSave.vendor = variation.vendor
                productForSave.barcode = variation.barcode
                productForSave.origin_supplier_price =
                    variation.origin_supplier_price
                productForSave.high_retail_price = variation.high_retail_price
                productForSave.low_retail_price = variation.low_retail_price
                productForSave.currency_code = variation.currency_code
                productForSave.supplier_warehousing_id =
                    variation.supplier_warehousing_id
                productForSave.tags = variation.tags.split(',')
                productForSave.product_category_id =
                    variation.categories.split(',')
                productForSave.product_image_ids =
                    variation.product_image_ids.split(',')
            }

            if (!productForSave.option_1 && variation.option_1_name)
                productForSave.option_1 = variation.option_1_name
            if (!productForSave.option_2 && variation.option_2_name)
                productForSave.option_2 = variation.option_2_name
            if (!productForSave.option_3 && variation.option_3_name)
                productForSave.option_3 = variation.option_3_name

            const variationBuidler = {}
            variationBuidler.option_1 = variation.option_1_value
            variationBuidler.option_2 = variation.option_2_value
            variationBuidler.option_3 = variation.option_3_value
            variationBuidler.sku = variation.sku
            variationBuidler.name = `${variation.name}-${variation.option_1_value}${variation.option_2_value}`
            variationBuidler.barcode = variation.barcode
            variationBuidler.high_retail_price = variation.high_retail_price
            variationBuidler.low_retail_price = variation.low_retail_price
            variationBuidler.weight_grams = variation.weight_grams
            variationBuidler.total_quantity = variation.total_quantity
            variationBuidler.currency_code = variation.currency_code

            productVariations.push(variationBuidler)
        }
        productForSave.variations = productVariations
        productForSave.partner_id = user.partner_id
        productForSave.odii_price =
            productForSave.origin_supplier_price * ODII_PRICE_EXT
        productForSave.status = STATUS.INACTIVE
        productForSave.publish_status =
            PRODUCT_PUBLISH_STATUS.PENDING_FOR_REVIEW
        productsForSave.push(productForSave)
    }

    // const data = await ProductService.supplierCreateProduct(
    //     user,
    //     productsForSave
    // )

    return {
        is_success: true,
        data: productsForSave,
    }
}

exports.getProductsV2 = async (request) => {
    // console.log('getProductsV2 = , ', request.query)
    const option = parseOption(request.query)
    if (request.query.filter_quantity)
        request.query.filter_quantity = _.isArray(request.query.filter_quantity)
            ? request.query.filter_quantity
            : [request.query.filter_quantity]
    if (request.query.tag)
        request.query.tag = _.isArray(request.query.tag)
            ? request.query.tag
            : [request.query.tag]
    if (request.query.category_id)
        request.query.category_id = _.isArray(request.query.category_id)
            ? request.query.category_id
            : [request.query.category_id]

    if (request.query.child_category_id)
        request.query.child_category_id = _.isArray(
            request.query.child_category_id
        )
            ? request.query.child_category_id
            : [request.query.child_category_id]

    if (request.query.filter_times_pushed)
        request.query.filter_times_pushed = _.isArray(
            request.query.filter_times_pushed
        )
            ? request.query.filter_times_pushed
            : [request.query.filter_times_pushed]

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            from_province_code: Joi.string().min(2),
            status: Joi.string().min(2).max(20),
            publish_status: Joi.string().min(2).max(20),
            from_rating: Joi.number().integer(),
            to_rating: Joi.number().integer(),
            has_variation: Joi.boolean(),

            from_price: Joi.number().integer(),
            to_price: Joi.number().integer(),

            from_total_quantity: Joi.number().integer(),
            to_total_quantity: Joi.number().integer(),

            filter_quantity: Joi.array().items(
                Joi.string()
                    .allow('0-100', '100-500', '500-1000', '1000-max')
                    .only()
            ),

            filter_times_pushed: Joi.array().items(
                Joi.string()
                    .allow('0-500', '500-1000', '1000-2000', '2000-max')
                    .only()
            ),

            from_number_of_times_pushed: Joi.number().integer(),
            to_number_of_times_pushed: Joi.number().integer(),

            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
            supplier_warehouse_return_id: Joi.string(),
            page: Joi.string(),
            page_size: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    if (query.filter_quantity)
        query.filter_quantity = query.filter_quantity.map((item) => {
            const [from, to] = item.split('-')

            return { from: from * 1, to: to * 1 || undefined }
        })

    if (query.filter_times_pushed)
        query.filter_times_pushed = query.filter_times_pushed.map((item) => {
            const [from, to] = item.split('-')

            return { from: from * 1, to: to * 1 || undefined }
        })

    option.status = STATUS.ACTIVE
    option.publish_status = PRODUCT_PUBLISH_STATUS.ACTIVE

    const data = await SearchCtl.suggestProductByKeyword(
        query,
        query.page,
        query.page_size
    )
    // eslint-disable-next-line no-underscore-dangle
    const result = data.data.map((item) => item._source)

    return {
        is_success: true,
        data: result,
    }
}

// exports.getProductCate = async (request) => {
//     const query = await Joi.object()
//         .keys({
//             keyword: Joi.string().min(2),
//             page: Joi.string(),
//             page_size: Joi.string(),
//         })
//         .validateAsync(request.query, {
//             stripUnknown: false,
//             allowUnknown: true,
//         })
// const data = await SearchCtl.suggestProductCateByKeyword(
//         query,
//         query.page,
//         query.page_size
//     )
//     // eslint-disable-next-line no-underscore-dangle
//     const result = data.data.map((item) => item._source)

//     return {
//         is_success: true,
//         data: result,
//     }
// }
exports.adminGetProductTimeLine = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { type: 'product' }

    const data = await AuditLog.getAuditLogByIdAndType(id, options)

    if (_.isEmpty(data)) {
        throw new Error('product_id_has_not_information')
    }

    return {
        is_success: true,
        data,
    }
}
exports.supplierGetProductTimeLine = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { type: 'product', user: user.id }

    const data = await AuditLog.getAuditLogByIdAndType(id, options)

    if (_.isEmpty(data)) {
        throw new Error('product_id_has_not_information')
    }

    return {
        is_success: true,
        data,
    }
}
