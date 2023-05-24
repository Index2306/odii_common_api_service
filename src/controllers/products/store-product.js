/* eslint-disable new-cap */
const Joi = require('joi')
const _ = require('lodash')
const StoreProduct = require('../../models/store-product')
const Store = require('../../models/store')
const RawStoreProduct = require('../../models/raw-store-product')
const RawStoreOrder = require('../../models/raw-store-order')
const StoreProductVariation = require('../../models/store-product-variation')
const StoreProductImage = require('../../models/store-product-image')
const { parseOption } = require('../../utils/pagination')
const StoreProductService = require('../../services/store-product.service')
const LazadaInternalSvc = require('../../services/lazada.service')
const TikTokInternalSvc = require('../../services/tiktok.service')
const AppError = require('../../utils/app-error')
const PromotionCtl = require('../promotion')
const {
    // STATUS,
    STATUS_ARR,
    STORE_PRODUCT_PUBLISH_STATUS,
} = require('../../constants')

exports.addProductToImportList = async (request) => {
    const { user } = request
    const { product_id } = await Joi.object()
        .keys({
            product_id: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const result = await StoreProductService.sellerCloneProductStockToStoreProduct(
        {
            product_stock_id: product_id,
        },
        user
    )

    return {
        is_success: true,
        data: result,
    }
}

exports.SyncAddProductStockToSeller = async (request) => {
    const { user } = request
    const values = await Joi.object()
        .keys({
            name: Joi.string().required(),
            description: Joi.string(),
            short_description: Joi.string().allow(null).optional(),
            thumb: Joi.string(),
            price: Joi.number(),
            option_1: Joi.string().allow(null),
            option_2: Joi.string().allow(null),
            option_3: Joi.string().allow(null),
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
            variations: Joi.array()
                .items(
                    Joi.object().keys({
                        thumb: Joi.string(),
                        price: Joi.number(),
                        option_1: Joi.string().optional(),
                        option_2: Joi.string().optional(),
                        option_3: Joi.string().optional(),
                    })
                )
        }).validateAsync(request.body, { stripUnknown: true })

    const result = await StoreProductService.syncAddProductStock(values, user)

    return {
        is_success: true,
        data: result,
    }
}

exports.duplicateStoreProduct = async (request) => {
    const { user } = request
    const { store_product_id } = await Joi.object()
        .keys({
            store_product_id: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const result = await StoreProductService.sellerDuplicateStoreProduct(
        {
            store_product_id,
        },
        user
    )

    return {
        is_success: true,
        data: result,
    }
}

exports.sellerDeleteStoreProduct = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })

    // TIKTOK khi xóa, khôi phục lại thì sẽ ở trạng thái Hủy kích hoạt, Cần thêm bước Kích hoạt để chuyển trạng thái sang Hoạt động
    const isSelling = request.query.is_selling === 'true'
    const isRecover = request.query.is_recover === 'true'
    const isNeedActive = request.query.is_need_active === 'true'

    // Xóa khi ở trạng thái đang bán
    if (isSelling) {
        const currentProduct = await StoreProduct.getById(id)
        const store = await Store.getOne({ id: currentProduct.store_id })

        if (currentProduct?.platform === 'lazada') {
            // const updateLazadaResult = await LazadaInternalSvc.lzdUpdateProduct(
            //     {
            //         partner_id: user.partner_id,
            //         store_product_id: id,
            //     }
            // )
            // if (!updateLazadaResult)
            //     throw new AppError('delete_tiktok_fail', {
            //         message:
            //             'Xóa sản phẩm thất bại. Vui long thử lại hoặc liên hệ vói hỗ trợ.',
            //     })
        } else if (currentProduct?.platform === 'tiktok') {
            await TikTokInternalSvc.tikTokDeleteProduct({
                partner_id: user.partner_id,
                shop_product_id: currentProduct.shop_product_id,
                platform_shop_id: store.platform_shop_id,
                isDelete: !isRecover && !isNeedActive,
                isNeedActive,
            })

            // if (!deleteTikTokResult)
            //     throw new AppError('delete_tiktok_fail', {
            //         message:
            //             'Xóa sản phẩm thất bại. Vui long thử lại hoặc liên hệ vói hỗ trợ.',
            //     })

            // await StoreProduct.update(
            //     {
            //         id,
            //         partner_id: user.partner_id,
            //     },
            //     {
            //         status: STATUS.INACTIVE,
            //         is_deleted: true,
            //     }
            // )

            return {
                is_success: true,
            }
        }

        return {
            is_success: true,
        }
    }

    // Xóa khi ở trạng thái đã chọn
    await StoreProductService.deleteStoreProductSelected(id)

    return {
        is_success: true,
        // data: result,
    }
}

exports.sellerDeleteStoreProductImage = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })

    const result = await StoreProductImage.update(
        {
            id,
            partner_id: user.partner_id,
        },
        {
            is_deleted: true,
        }
    )

    return {
        is_success: result === 1,
        data: result,
    }
}

exports.sellerGetImportProducts = async (request) => {
    const {
        user,
        query: { platform, store_id, odii_status, ware_house },
    } = request

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.include_variation = true
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            from_province_code: Joi.string(),
            status: Joi.string(),
            odii_status: Joi.string(),
            store_id: Joi.string(),
            ware_house: Joi.string(),
            platform: Joi.string(),
            publish_status: Joi.string()
                .allow(...Object.values(STORE_PRODUCT_PUBLISH_STATUS))
                .only(),
            is_selling: Joi.boolean().default(false),
            is_import_list: Joi.boolean().default(false),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    if (!_.isEmpty(platform)) {
        const platformList = platform.split(',')
        if (platformList.length > 0) {
            query.platformList = platformList
        }
    }

    if (!_.isEmpty(store_id)) {
        const storeIdList = store_id.split(',')
        if (storeIdList.length > 0) {
            query.storeIdList = storeIdList
        }
    }

    if (!_.isEmpty(odii_status)) {
        const statusList = odii_status.split(',')
        if (statusList.length > 0) {
            query.statusList = statusList
        }
    }

    const data = await StoreProduct.getListing(option, query)

    if (!_.isEmpty(data.data)) {
        data.data = data.data.map((product) => {
            if (!_.isEmpty(product.product_variation)) {
                product.product_variation = product.product_variation.map(
                    (variation) => {
                        if (!_.isEmpty(variation.promotion)) {
                            const final_price = PromotionCtl.disCountFormula(
                                variation.origin_supplier_price,
                                variation?.promotion?.type?.includes(
                                    'quantity_by'
                                )
                                    ? variation.promotion.value
                                    : variation.promotion.promotion_product
                                        .value,
                                1,
                                !!(
                                    variation?.promotion?.type?.includes(
                                        'quantity_by'
                                    ) ||
                                    variation?.promotion?.promotion_product?.type?.includes(
                                        'percent'
                                    )
                                )
                            )

                            variation.promotion = {
                                id: variation.promotion.id,
                                finalPrice: final_price,
                                origin_supplier_price:
                                    variation.origin_supplier_price,
                                type: variation.promotion.type,
                                typeOption:
                                    variation.promotion.promotion_product.type,
                                name: variation?.promotion?.name,
                            }

                            return variation
                        }

                        return variation
                    }
                )
            }

            return product
        })
    }

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierGetImportProducts = async (request) => {
    const {
        user,
        query: { platform, store_id, odii_status },
    } = request

    const option = parseOption(request.query)
    // option.partner_id = user.partner_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            from_province_code: Joi.string(),
            status: Joi.string(),
            odii_status: Joi.string(),
            store_id: Joi.string(),
            platform: Joi.string(),
            publish_status: Joi.string()
                .allow(...Object.values(STORE_PRODUCT_PUBLISH_STATUS))
                .only(),
            is_selling: Joi.boolean().default(false),
            is_import_list: Joi.boolean().default(false),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    if (!_.isEmpty(platform)) {
        const platformList = platform.split(',')
        if (platformList.length > 0) {
            query.platformList = platformList
        }
    }

    if (!_.isEmpty(store_id)) {
        const storeIdList = store_id.split(',')
        if (storeIdList.length > 0) {
            query.storeIdList = storeIdList
        }
    }

    if (!_.isEmpty(odii_status)) {
        const statusList = odii_status.split(',')
        if (statusList.length > 0) {
            query.statusList = statusList
        }
    }

    const data = await StoreProduct.getListProduct(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getProductDetail = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await StoreProduct.getStoreProductDetailOnly(id, {
        partner_id: user.partner_id,
    })
    data.store_product_images = data.store_product_images.filter(
        (image) => !image.is_thumb
    )

    if (!_.isEmpty(data.variations)) {
        data.variations = data.variations.map((variation) => {
            if (!_.isEmpty(variation.promotion)) {
                const final_price = PromotionCtl.disCountFormula(
                    variation.origin_supplier_price,
                    variation?.promotion?.type?.includes('quantity_by')
                        ? variation.promotion.value
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
                    origin_supplier_price: variation.origin_supplier_price,
                    type: variation.promotion.type,
                    typeOption: variation.promotion.promotion_product.type,
                    name: variation?.promotion?.name,
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

exports.getStoreProductVariations = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    // const data = await StoreProduct.getStoreProductDetailOnly(id)
    let data = await StoreProductVariation.getManyByProductId(id)

    if (!_.isEmpty(data)) {
        data = data.map((variation) => {
            if (!_.isEmpty(variation.promotion)) {
                const final_price = PromotionCtl.disCountFormula(
                    variation.origin_supplier_price,
                    variation?.promotion?.type?.includes('quantity_by')
                        ? variation.promotion.value
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
                        ? variation.promotion.value
                        : variation.promotion.promotion_product.value,
                    origin_supplier_price:
                        variation.promotion.origin_supplier_price,
                    type: variation.promotion.type,
                    typeOption: variation.promotion.promotion_product.type,
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

exports.sellerPushStoreProduct = async (request) => {
    console.log('run sellerPushStoreProduct')
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })
    const storeProduct = await StoreProduct.getById(id)
    if (!storeProduct)
        throw new AppError('stor_product_not_found', {
            message: 'Không tìm thấy sản phẩm',
        })
    if (!storeProduct.store_id || !storeProduct.platform)
        throw new AppError('missing_store_info', {
            message: 'Vui lòng chọn cửa hàng bạn muốn đẩy',
        })
    const store = await Store.getOne({ id: storeProduct.store_id })
    console.log('id', id)
    if (!store?.platform_shop_id) throw new Error('invalid_store_id')
    if (storeProduct.platform === 'lazada') {
        // lazada not insert vendor
        delete storeProduct.vendor
        const response = await LazadaInternalSvc.lzdPushStoreProduct({
            partner_id: user.partner_id,
            store_product_id: storeProduct.id,
            store_id: storeProduct.store_id,
        })

        return {
            is_success: true,
            data: response,
        }
    }
    if (storeProduct.platform === 'shopee') {
        // store_product_id, platform_shop_id
        const response = await LazadaInternalSvc.shopeePushStoreProduct({
            store_product_id: storeProduct.id,
            platform_shop_id: store.platform_shop_id,
        })

        return {
            is_success: true,
            data: response,
        }
    }
    if (storeProduct.platform === 'tiktok') {
        const response = await TikTokInternalSvc.tikTokPushStoreProduct({
            partner_id: user.partner_id,
            store_product_id: storeProduct.id,
            platform_shop_id: store.platform_shop_id,
            store_id: storeProduct.store_id,
        })

        return {
            is_success: true,
            data: response,
        }
    }

    throw new AppError('invalid', { message: 'Nền tảng chưa được hỗ trợ' })
}

exports.sellerUpdateStoreProduct = async (request) => {
    console.log('run sellerUpdateStoreProduct')
    const { user } = request
    const {
        id,
        store_product_images_ids,
        variations,
        tags,
        platform_extra_attributes,
        is_selling,
        ...body
    } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string().allow(null).optional(),
            description: Joi.string().allow(null).optional(),
            short_description: Joi.string().allow(null).optional(),
            vendor: Joi.string().allow(null).optional(),
            store_id: Joi.string().allow(null).optional(),
            platform: Joi.string().allow(null).optional(),
            has_variation: Joi.boolean().required(),
            status: Joi.string().allow(null).optional(),
            is_selling: Joi.boolean(),
            publish_status: Joi.string()
                .allow(
                    STORE_PRODUCT_PUBLISH_STATUS.INACTIVE,
                    STORE_PRODUCT_PUBLISH_STATUS.READY,
                    STORE_PRODUCT_PUBLISH_STATUS.PENDING,
                    STORE_PRODUCT_PUBLISH_STATUS.ACTIVE
                )
                .only(),
            thumb: Joi.object().allow(null),
            store_product_images_ids: Joi.array()
                .items(Joi.string().required())
                .min(1),
            tags: Joi.array().items(Joi.string().min(2)).allow(null).max(10),
            // retail_price: Joi.number().optional(),
            // retail_price_compare_at: Joi.number().optional(),

            primary_cat_id: Joi.string().allow(null).optional(),
            primary_cat_metadata: Joi.array()
                .items(
                    Joi.object().keys({
                        id: Joi.string().optional(),
                        name: Joi.string().allow(null).optional(),
                        leaf: Joi.boolean().allow(null).optional(),
                    })
                )
                .allow(null)
                .optional(),

            platform_extra_attributes: Joi.array()
                .items(Joi.object())
                .allow(null)
                .optional(),
            attributes: Joi.object().allow(null).optional(),
            number_of_variation: Joi.number().integer().allow(null).optional(),

            variations: Joi.array()
                .items(
                    Joi.object().keys({
                        id: Joi.string().optional(),
                        sku: Joi.string().allow(null).optional(),
                        barcode: Joi.string().allow(null).optional(),
                        name: Joi.string().allow(null).optional(),
                        attributes: Joi.object().allow(null).optional(),
                        store_product_image_id: Joi.string()
                            .allow(null)
                            .optional(),

                        status: Joi.string()
                            .allow(...STATUS_ARR)
                            .only()
                            .optional(),

                        retail_price: Joi.number().allow(null).optional(),
                        retail_price_compare_at: Joi.number()
                            .allow(null)
                            .optional(),
                        total_quantity: Joi.number().optional(),

                        option_1: Joi.string().allow(null).optional(),
                        option_2: Joi.string().allow(null).optional(),
                        option_3: Joi.string().allow(null).optional(),

                        variation_index: Joi.array().allow(null).optional(),
                    })
                )
                .min(1)
                .required(),
        })
        .validateAsync(
            { ...request.body, ...request.params, ...request.query },
            { stripUnknown: true }
        )

    const currentProduct = await StoreProduct.getStoreProductDetailOnly(id, {
        partner_id: user.partner_id,
    })

    if (!currentProduct?.id) throw new Error('STORE_PRODUCT_NOT_FOUND')

    const data = await StoreProductService.updateStoreProduct(
        user,
        {
            variations,
            id,
            store_product_images_ids,
            platform_extra_attributes,
            tags,
            ...body,
        },
        currentProduct
    )

    if (is_selling === true) {
        // update to lazada
        if (currentProduct.platform === 'lazada') {
            const updateLazadaResult = await LazadaInternalSvc.lzdUpdateProduct(
                {
                    partner_id: user.partner_id,
                    store_product_id: currentProduct.id,
                }
            )
            if (!updateLazadaResult)
                throw new AppError('update_lzd_fail', {
                    message:
                        'Cập nhật thành công. Nhưng cập nhật LAZADA thất bại. Vui long thử lại hoặc liên hệ vói hỗ trợ.',
                })
        } else if (currentProduct.platform === 'tiktok') {
            const updateTikTokResult =
                await TikTokInternalSvc.tikTokUpdateProduct({
                    partner_id: user.partner_id,
                    store_product_id: currentProduct.id,
                })

            console.log(updateTikTokResult)
            if (!updateTikTokResult)
                throw new AppError('update_tiktok_fail', {
                    message:
                        'Cập nhật thành công. Nhưng cập nhật TIKTOK thất bại. Vui long thử lại hoặc liên hệ vói hỗ trợ.',
                })
        }
    }

    return {
        is_success: true,
        data,
    }
}

exports.editProductImage = async (req) => {
    const { user } = req

    const {
        store_product_id,
        store_product_image_id,
        is_save_new,
        image,
        is_thumb,
    } = await Joi.object()
        .keys({
            store_product_id: Joi.string().required(),
            store_product_image_id: Joi.string().required(),
            is_save_new: Joi.boolean().required(),
            is_thumb: Joi.boolean().default(false),
            image: Joi.object().required(),
        })
        .validateAsync(req.body, { stripUnknown: true })
    const storeProductExist = await StoreProduct.getById(store_product_id)
    if (!storeProductExist) throw new Error('store_product_not_found')

    let store_product_image_id_1 = store_product_image_id
    if (is_thumb) {
        await StoreProduct.updateById(
            store_product_id,
            StoreProduct.reformat({
                thumb: image,
            })
        )

        const headImgData = await StoreProductImage.getOne({
            store_product_id,
            is_thumb: true,
        })

        if (headImgData) {
            store_product_image_id_1 = headImgData.id
        }

        // return {
        //     is_success: true,
        //     data: {
        //         store_product_id,
        //         is_thumb,
        //     },
        // }
    }

    const storeProductImage = await StoreProductImage.getOneById(
        store_product_image_id_1
    )

    if (!storeProductImage) {
        if (is_thumb) {
            return {
                is_success: true,
                data: {
                    store_product_id,
                    is_thumb,
                },
            }
        }

        throw new Error('storeProductImage_not_found')
    }

    const productImageBody = {
        partner_id: user.partner_id,
        store_product_id,
        width: image.metadata?.width,
        height: image.metadata?.height,
        location: image.location,
        name: image.name,
        source: req.odii_source,
        product_image_id: storeProductImage.product_image_id,
        store_image_url: '',
    }

    let productImageId = store_product_image_id_1
    if (is_save_new) {
        const [newProductImageId] = await StoreProductImage.insert(
            productImageBody
        )
        productImageId = newProductImageId
    } else {
        await StoreProductImage.update(
            {
                store_product_id,
                id: store_product_image_id_1,
            },
            productImageBody
        )
    }

    return {
        is_success: true,
        data: is_thumb
            ? {
                store_product_id,
                is_thumb,
            }
            : {
                store_product_id,
                id: productImageId,
                ...productImageBody,
            },
    }
}

exports.sellerGetProductsOnSale = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            status: Joi.string().min(2).max(20),
            store_id: Joi.string(),
            platform: Joi.string(),
            publish_status: Joi.string()
                .allow(...Object.values(STORE_PRODUCT_PUBLISH_STATUS))
                .only(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await RawStoreProduct.getListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetProductsOnSaleV2 = async (request) => {
    const { user } = request
    const isNotOdii = request.query.isNotOdii === 'true'
    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.isNotOdii = isNotOdii
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            status: Joi.string().min(2).max(20),
            store_id: Joi.string(),
            platform: Joi.string(),
            publish_status: Joi.string()
                .allow(...Object.values(STORE_PRODUCT_PUBLISH_STATUS))
                .only(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await RawStoreProduct.getListingV2(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetRawStore = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            store_id: Joi.string(),
            platform: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await RawStoreOrder.getListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetRawStoreDetail = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const options = {
        partner_id: user.partner_id,
    }
    const data = await RawStoreOrder.getOrderRawDetailById(id, options)

    if (!data) throw new Error('not_found')

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetWareHouse = async (request) => {
    const { user } = request
    const query = await Joi.object()
        .keys()
        .validateAsync({ ...request.params }, { stripUnknown: true })
    const options = {
        partner_id: user.partner_id,
        tenant_id: user.tenant_id,
    }
    const data = await StoreProduct.sellerGetWareHouse(options)

    if (!data) throw new Error('not_found')

    return {
        is_success: true,
        ...data,
    }
}
