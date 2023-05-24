const CommonUtil = require('../utils/common.util')

const IGNORED_ATTRS = [
    'SellerSku',
    'description',
    'description_en',
    'tax_class',
    '__images__',
    'video',
    'quantity',
    'special_price',
    'special_from_date',
    'special_to_date',
    'product_warranty_en',
    'delivery_option_express',
    'short_description',
    'brand',
    'name',
    'name_en',
    'package_length',
    'price',
    'package_weight',
    'package_length',
    'package_height',
    'package_width',
    'color_thumbnail',
    'fa_pattern',
    'collar_type',
    'sleeves',
    'delivery_option_economy',
    'package_content',
    'occasion',
    'Hazmat',
    'fa_general_styles',
    'fa_season',
    'Delivery_Option_Instant',
]

const SHOPEE_IGNORED_ATTRS = ['Country of Origin']

exports.filterLazadaCatAttrs = ({ attributes }) => {
    const data = {}
    const attsResult = []
    const attrMultiValue = []
    // eslint-disable-next-line no-restricted-syntax
    for (const itemAttr of attributes) {
        if (IGNORED_ATTRS.includes(itemAttr.name)) {
            // eslint-disable-next-line no-continue
            continue
        }
        if (itemAttr.is_mandatory) itemAttr.priority = 20
        else itemAttr.priority = 50

        if (itemAttr.name === 'warranty_type') {
            if (itemAttr.is_mandatory) itemAttr.priority = 1
            else itemAttr.priority = 41
        }

        if (itemAttr.name === 'warranty') {
            itemAttr.label_vi = 'Thời gian bảo hành'
            if (itemAttr.is_mandatory) itemAttr.priority = 2
            else itemAttr.priority = 42
        }

        if (itemAttr.name === 'country_origin_hb') {
            itemAttr.options = [
                { name: 'Việt Nam' },
                { name: 'Trung Quốc' },
                { name: 'US' },
                { name: 'Châu Âu' },
                { name: 'OEM' },
                { name: 'Nội Địa' },
            ]
        }
        if (
            itemAttr.is_sale_prop === 1 &&
            itemAttr.attribute_type === 'sku' &&
            (itemAttr.input_type === 'multiSelect' ||
                itemAttr.input_type === 'multiEnumInput' ||
                itemAttr.input_type === 'enumInput')
        ) {
            attrMultiValue.push(itemAttr)
        } else {
            attsResult.push(itemAttr)
        }
    }

    data.attributes = attsResult.sort((x, y) => x.priority - y.priority)
    data.attributes_multi_value = attrMultiValue.sort(
        (x, y) => x.priority - y.priority
    )

    return data
}

exports.filterShopeeCatAttrs = ({ attributes }) => {
    // const data = {}
    const attrResult = []
    // const attrMultiValue = []
    // eslint-disable-next-line no-restricted-syntax
    for (const itemAttr of attributes) {
        console.log(
            'itemAttr.original_attribute_name = ',
            itemAttr.original_attribute_name
        )
        if (SHOPEE_IGNORED_ATTRS.includes(itemAttr.original_attribute_name)) {
            // eslint-disable-next-line no-continue
            continue
        }
        if (itemAttr.is_mandatory) itemAttr.priority = 20
        else itemAttr.priority = 50

        // if (itemAttr.name === 'warranty_type') {
        //     if (itemAttr.is_mandatory) itemAttr.priority = 1
        //     else itemAttr.priority = 41
        // }

        // if (itemAttr.name === 'warranty') {
        //     itemAttr.label_vi = 'Thời gian bảo hành'
        //     if (itemAttr.is_mandatory) itemAttr.priority = 2
        //     else itemAttr.priority = 42
        // }

        // if (itemAttr.original_attribute_name === 'Country of Origin') {
        //     itemAttr.options = [
        //         { name: 'Việt Nam' },
        //         { name: 'Trung Quốc' },
        //         { name: 'US' },
        //         { name: 'Châu Âu' },
        //         { name: 'OEM' },
        //         { name: 'Nội Địa' },
        //     ]
        // }
        // if (
        //     itemAttr.is_sale_prop === 1 &&
        //     itemAttr.attribute_type === 'sku' &&
        //     (itemAttr.input_type === 'multiSelect' ||
        //         itemAttr.input_type === 'multiEnumInput' ||
        //         itemAttr.input_type === 'enumInput')
        // ) {
        //     attrMultiValue.push(itemAttr)
        // } else {
        //     attsResult.push(itemAttr)
        // }

        attrResult.push(itemAttr)
    }

    attrResult.sort((x, y) => x.priority - y.priority)
    // data.attributes_multi_value = attrMultiValue.sort(
    //     (x, y) => x.priority - y.priority
    // )

    return attrResult
}

exports.mapOdiiCatAttrTo = (platform, odiiCatAttrs, platformCatAttrs) => {
    if (platform === 'lazada') {
        const odiiCatAttrsMap = CommonUtil.arrayToMap(odiiCatAttrs, 'name')
        const { attributes, attributes_multi_value } =
            exports.filterLazadaCatAttrs({
                attributes: platformCatAttrs,
            })

        return [...attributes, ...attributes_multi_value].map((attrItem) => ({
            ...attrItem,
            ...odiiCatAttrsMap.get(attrItem.name),
        }))
    }

    if (platform === 'shopee') {
        // add value cho nhung truong man
        const tmpResult = exports.filterShopeeCatAttrs({
            attributes: platformCatAttrs,
        })

        // return platformCatAttrs
        return tmpResult
    }
}

function genCategoryChildTree(category, categoryParentMap) {
    const categoryId = category.id
    if (category.leaf) {
        return
    }

    const categoryChilds = categoryParentMap.get(categoryId)
    category.children = categoryChilds

    // eslint-disable-next-line no-restricted-syntax
    for (const categoryChild of categoryChilds) {
        genCategoryChildTree(categoryChild, categoryParentMap)
    }
}

exports.genCategoryTree = (categories) => {
    const categoryParentMap = new Map()
    const categoryTree = []
    // eslint-disable-next-line no-restricted-syntax
    for (const category of categories) {
        const categoryParentId = category.parent_id

        const categoryId = category.id
        if (categoryParentId === null) {
            categoryTree.push(category)
            // eslint-disable-next-line no-continue
            continue
        }
        if (categoryParentMap.has(categoryParentId)) {
            categoryParentMap.get(categoryParentId).push(category)
            // eslint-disable-next-line no-continue
            continue
        }
        categoryParentMap.set(categoryParentId, [category])
    }

    for (const category of categoryTree) {
        genCategoryChildTree(category, categoryParentMap)
    }

    return categoryTree
}
