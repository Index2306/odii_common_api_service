const Joi = require('joi')
const _ = require('lodash')
const { redisClient } = require('../connections/redis-cache')
const Category = require('../models/product-category')
const Product = require('../models/product')
const PlatformCategoryList = require('../models/platform-category-list')
const StoreCategoryAttribute = require('../models/store-category-attribute')
const { parseOption } = require('../utils/pagination')
const { REDIS_KEY, ACC_TYPE } = require('../constants')
const AppError = require('../utils/app-error')
const CategoryService = require('../services/category.service')
const { isEmpty } = require('lodash')

exports.getCategoryTree = async (request) => {
    const { user } = request
    let data = await redisClient.getObject(REDIS_KEY.CATEGORY)
    if (!data) {
        const option = {
            status: 'active',
            // tenant_id: user.tenant_id,
        }
        const result = await Category.adminGetCategoriesTree(option)

        data = CategoryService.genCategoryTree(result)

        await redisClient.setObject(REDIS_KEY.CATEGORY, data)
    }

    return {
        is_success: true,
        data,
    }
}

exports.adminGetCategoryTree = async (request) => {
    const { user } = request

    const { keyword } = await Joi.object()
        .keys({
            keyword: Joi.string(),
        })
        .validateAsync(request.params, { stripUnknown: true })
    let data = await redisClient.getObject(REDIS_KEY.ADMIN_CATEGORY)

    const option = {
        tenant_id: user.tenant_id,
    }
    const result = await Category.adminGetCategoriesTree(option)

    data = CategoryService.genCategoryTree(result)

    await redisClient.setObject(REDIS_KEY.ADMIN_CATEGORY, data)

    return {
        is_success: true,
        data,
    }
}

exports.createCategory = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            name: Joi.string(),
            // description: Joi.string().required(),
            parent_id: Joi.number().required().allow(null),
            thumb: Joi.object().allow(null),
            icon: Joi.object().allow(null),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.tenant_id = user.tenant_id
    await Category.insertCategory(value)
    redisClient.delObject(REDIS_KEY.CATEGORY)
    // await Promise.all([
    //     Category.insertCategory(value),
    //     Category.getCategoryById(value.parent_id),
    // ])

    return {
        is_success: true,
    }
}

exports.updateCategory = async (request) => {
    const { id, source, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            description: Joi.string().allow(''),
            parent_id: Joi.number().allow(null),
            thumb: Joi.object().allow(null),
            icon: Joi.object().allow(null),
            status: Joi.string(),
            priority: Joi.number(),
            shopee_cat_ids_mapped: Joi.array().allow(null).default([]),
        })
        .validateAsync(
            { ...request.body, ...request.params, source: request.odii_source },
            { stripUnknown: true }
        )

    const category = await Category.getCategoryById(id)

    if (!category) throw new Error('category_id_not_found')

    if (source === ACC_TYPE.ADMIN) {
        redisClient.delObject(REDIS_KEY.ADMIN_CATEGORY)
    } else {
        redisClient.delObject(REDIS_KEY.CATEGORY)
    }

    if (body.shopee_cat_ids_mapped)
        body.shopee_cat_ids_mapped = JSON.stringify(body.shopee_cat_ids_mapped)

    await Category.updateCategoryById(id, body)

    return {
        is_success: true,
    }
}

exports.getCategoryDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Category.getCategoryById(id)

    if (data.shopee_cat_ids_mapped) {
        data.info_mapped = await PlatformCategoryList.getManyByShopCatIds(
            data.shopee_cat_ids_mapped
        )
        console.log('data.info_mapped', data.info_mapped)
    } else {
        data.info_mapped = []
    }

    if (!data) throw new Error('category_id_not_found')
    if (data.store_cat_id) {
        const storeCatAtts = await Category.getStoreCatAttr({
            category_id: data.store_cat_id,
            platform: 'lazada',
        })
        if (!_.isEmpty(storeCatAtts?.attributes)) {
            // const attsResult = []
            // const attrMultiValue = []
            // // eslint-disable-next-line no-restricted-syntax
            // for (const itemAttr of attributes) {
            //     if (IGNORED_ATTRS.includes(itemAttr.name)) {
            //         // eslint-disable-next-line no-continue
            //         continue
            //     }
            //     if (itemAttr.is_mandatory) itemAttr.priority = 20
            //     else itemAttr.priority = 50

            //     if (itemAttr.name === 'warranty_type') {
            //         if (itemAttr.is_mandatory) itemAttr.priority = 1
            //         else itemAttr.priority = 41
            //     }

            //     if (itemAttr.name === 'warranty') {
            //         itemAttr.label_vi = 'Thời gian bảo hành'
            //         if (itemAttr.is_mandatory) itemAttr.priority = 2
            //         else itemAttr.priority = 42
            //     }

            //     if (itemAttr.name === 'country_origin_hb') {
            //         itemAttr.options = [
            //             { name: 'Việt Nam' },
            //             { name: 'Trung Quốc' },
            //             { name: 'US' },
            //             { name: 'Châu Âu' },
            //             { name: 'OEM' },
            //             { name: 'Nội Địa' },
            //         ]
            //     }
            //     if (
            //         itemAttr.is_sale_prop === 1 &&
            //         itemAttr.attribute_type === 'sku' &&
            //         (itemAttr.input_type === 'multiSelect' ||
            //             itemAttr.input_type === 'multiEnumInput' ||
            //             itemAttr.input_type === 'enumInput')
            //     ) {
            //         attrMultiValue.push(itemAttr)
            //     } else {
            //         attsResult.push(itemAttr)
            //     }
            // }
            // data.attributes_multi_value = attrMultiValue.sort(
            //     (x, y) => x.priority - y.priority
            // )

            const tmp = CategoryService.filterLazadaCatAttrs(storeCatAtts)
            data.attributes = tmp.attributes
            data.attributes_multi_value = tmp.attributes_multi_value
        }
    }

    return {
        is_success: true,
        data,
    }
}

exports.getCategoriesListing = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    // option.tenant_id = user.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean(),
            is_leaf: Joi.boolean(),
            is_not_leaf: Joi.boolean(),
            ids: Joi.array(),
            parent_id: Joi.string(),
            page: Joi.number(),
            page_size: Joi.number(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: false }
        )

    const data = await Category.getListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.getCategoriesFieldListing = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean().default(true),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Category.getCateFieldListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.createCategoryField = async (request) => {
    const value = await Joi.object()
        .keys({
            name: Joi.string(),
            input_type: Joi.string(),
            attribute_type: Joi.string(),
            is_mandatory: Joi.boolean(),
            label: Joi.string(),
            options: Joi.object().allow(null),
            advanced: Joi.object().allow(null),
        })
        .validateAsync(request.body, { stripUnknown: true })

    redisClient.delObject(REDIS_KEY.CATEGORY_FIELD)

    const data = await Category.insertCategoryField(value)

    const success = data[0] !== 0

    return {
        success,
    }
}
exports.getCategoryFieldDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Category.getCategoryFieldById(id)

    if (!data) throw new Error('category_field_id_not_found')

    return {
        is_success: true,
        data,
    }
}

exports.updateCategoryField = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            input_type: Joi.string(),
            attribute_type: Joi.string(),
            is_mandatory: Joi.boolean(),
            label: Joi.string(),
            options: Joi.object().allow(null),
            advanced: Joi.object().allow(null),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const cateField = await Category.getCategoryFieldById(id)

    if (!cateField) throw new Error('category_field_id_not_found')

    const data = await Category.updateCategoryFieldById(id, body)
    const success = data[0] !== 0

    return {
        success,
    }
}
exports.getCategoriesListingV2 = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean(),
            is_leaf: Joi.boolean(),
            parent_id: Joi.string(),
            page: Joi.number(),
            page_size: Joi.number().default(15),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: false }
        )
    const data = await Category.suggestProductCateByKeyword(
        query,
        query.page,
        query.page_size
    )

    console.log('total item =', data.total)

    const result = data.data?.map((item) => item._source) || data

    return {
        is_success: true,
        data: result,
    }
}
exports.getCategoriesListingV2ByProductName = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean(),
            is_leaf: Joi.boolean(),
            parent_id: Joi.string(),
            page: Joi.number(),
            page_size: Joi.number().default(15),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: false }
        )
    const data = await Category.suggestProductCateByProductName(
        query,
        query.page,
        query.page_size
    )

    const result = data.data?.map((item) => item._source) || data

    return {
        is_success: true,
        data: result,
    }
}

exports.getStoreCatByOdiiCat = async (request) => {
    const option = parseOption(request.query)
    const { odii_cat_id, platform, keyword } = await Joi.object()
        .keys({
            odii_cat_id: Joi.string().required(),
            keyword: Joi.string(),
            platform: Joi.string()
                .allow('lazada', 'shopee', 'tiktok')
                .only()
                .required(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const odiiCat = await Category.getCategoryById(odii_cat_id)

    if (_.isEmpty(odiiCat?.ids_path)) throw new AppError('invalid_odii_cat')
    let data
    if (platform === 'lazada') {
        data = await PlatformCategoryList.getListing(option, {
            platform,
            shop_cat_id: odiiCat.store_cat_id,
        })
    }

    if (platform === 'shopee') {
        // const topOdiiCat = await Category.getCategoryById(odiiCat.ids_path[0])
        // console.log(
        //     '🚀 ~ file: category.js ~ line 357 ~ exports.getStoreCatByOdiiCat= ~ topOdiiCat',
        //     topOdiiCat
        // )
        // const topShopeeCat = topOdiiCat.shopee_cat_id_mapped
        // console.log(
        //     '🚀 ~ file: category.js ~ line 362 ~ exports.getStoreCatByOdiiCat= ~ topShopeeCat',
        //     topShopeeCat
        // )
        // option.shopee_cat_id_mapped = topShopeeCat

        option.ids_path = odiiCat.shopee_cat_ids_mapped

        option.has_children = false

        data = await PlatformCategoryList.getListing(option, {
            keyword,
            platform,
        })
    }

    return {
        is_success: true,
        ...data,
    }
}
exports.getStoreCat = async (request) => {
    const option = parseOption(request.query)
    const { odii_cat_id, platform, keyword } = await Joi.object()
        .keys({
            odii_cat_id: Joi.string(),
            keyword: Joi.string(),
            platform: Joi.string().allow('lazada', 'shopee').only().required(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await PlatformCategoryList.getListing(option, {
        keyword,
        platform,
    })

    return {
        is_success: true,
        ...data,
    }
}
exports.getStoreCatAtrributes = async (request) => {
    const { platform_category_id, platform, product_id } = await Joi.object()
        .keys({
            platform_category_id: Joi.string().required(),
            product_id: Joi.string().required(),
            product_category_id: Joi.string().required(),
            platform: Joi.string().allow('lazada', 'shopee').only().required(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const product = await Product.getOneById(product_id)
    if (!product) throw new Error('product_not_found')
    // const odiiCat = await Category.getCategoryById(product.product_category_id)

    let [platformCategory, catAttr] = await Promise.all([
        PlatformCategoryList.getOne({ shop_cat_id: platform_category_id }),
        StoreCategoryAttribute.getOne({
            category_id: platform_category_id,
            platform,
        }),
        Category.getStoreCatAttr({
            category_id: platform_category_id,
            platform,
        }),
    ])

    if (platformCategory?.has_children !== false)
        throw new AppError('invalid_leaf_category')
    // if (!catAttr) throw new AppError('platform_cat_not_found')
    if (!catAttr)
        catAttr = {
            attributes: [],
        }
    // console.log('catAttr = ', catAttr)
    const attributes = CategoryService.mapOdiiCatAttrTo(
        platform,
        product?.attributes,
        catAttr.attributes
    )

    return {
        is_success: true,
        data: {
            ...platformCategory,
            // ...catAttr,
            odii_cat_attributes: product?.attributes,
            attributes,
        },
    }
}

exports.getCategoriesListingV2ByProductName = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean(),
            is_leaf: Joi.boolean(),
            parent_id: Joi.string(),
            page: Joi.number(),
            page_size: Joi.number().default(15),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: false }
        )
    const data = await Category.suggestProductCateByProductName(
        query,
        query.page,
        query.page_size
    )

    const result = data.data?.map((item) => item._source) || data

    return {
        is_success: true,
        data: result,
    }
}
exports.searchPlatformCategory = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_top: Joi.boolean(),
            is_leaf: Joi.boolean(),
            parent_id: Joi.string(),
            page: Joi.number(),
            page_size: Joi.number().default(15),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: false }
        )
    const data = await Category.searchPlatformCategory(
        query,
        query.page,
        query.page_size
    )
    console.log('total:', data.total)

    const result = data.data?.map((item) => item._source) || data

    return {
        is_success: true,
        data: result,
    }
}
