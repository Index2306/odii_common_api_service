/* eslint-disable consistent-return */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */
import Logger from '../logger'

const _ = require('lodash')

const Product = require('../models/product')
const ProductStock = require('../models/product-stock')
const StoreProduct = require('../models/store-product')
const StoreProductImage = require('../models/store-product-image')
const StoreProductVariation = require('../models/store-product-variation')

const AuditLog = require('../models/audit-log')
const CommonUtil = require('../utils/common.util')
const { knex, useMyTrx } = require('../connections/pg-general')
const { removeEmpty } = require('../utils/common.util')
const {
    ODII_PRICE_EXT,
    MAD_PRICE,
    STATUS,
    PRODUCT_PUBLISH_STATUS,
    STORE_PRODUCT_PUBLISH_STATUS,
} = require('../constants')

const CalcRetailPrice = (user, supplierPrice) => {
    if (user?.recommend_price_selected_type === 1) {
        return supplierPrice + user.recommend_price_plus
    }
    if (
        user?.recommend_price_selected_type === 0 &&
        user.recommend_price_ratio > 0
    ) {
        return supplierPrice * user.recommend_price_ratio
    }

    return supplierPrice
}

exports.sellerCloneProductToStoreProduct = async ({ product_id }, user) => {
    const productData = await Product.getProductDetailOnly(product_id, {
        status: STATUS.ACTIVE,
        publish_status: PRODUCT_PUBLISH_STATUS.ACTIVE,
    })
    if (!productData?.id) throw new Error('product_not_found')
    const { variations, product_images, attributes, ...product } = productData

    // update product retail price based on setting
    const result = await useMyTrx(null, async (trx) => {
        const newProduct = {
            ..._.pick(product, StoreProduct.FULL_FIELDS),
            ...{
                id: undefined,
                sku: CommonUtil.getProductSKU(),
                created_at: undefined,
                partner_id: user.partner_id,
                tenant_id: user.tenant_id,
                product_id: product.id,
                thumb: JSON.stringify(product.thumb),
                tags: JSON.stringify(product.tags),
                quantity: product.total_quantity,
                publish_status: STORE_PRODUCT_PUBLISH_STATUS.INACTIVE,
                promotion_id: product?.promotion_id,
                is_promotion: product.is_promotion,
                retail_price: CalcRetailPrice(
                    user,
                    product.origin_supplier_price
                ),
            },
        }

        const [storeProductId] = await StoreProduct.insert(newProduct, { trx })

        const storeProductImages = await Promise.all(
            product_images.map(
                async (productImage) => {
                    const [newStoreImageId] = await StoreProductImage.insert(
                        removeEmpty({
                            ...productImage,
                            ...{
                                id: undefined,
                                product_id: undefined,
                                partner_id: user.partner_id,
                                store_product_id: storeProductId,
                                product_image_id: productImage.id,
                                created_at: undefined,
                            },
                        })
                    )

                    return {
                        product_image_id: productImage.id,
                        store_product_image_id: newStoreImageId,
                    }
                },
                { trx }
            )
        )

        await StoreProductVariation.upsertMany(
            variations.map((productVariation) =>
                removeEmpty({
                    ..._.pick(
                        productVariation,
                        StoreProductVariation.FULL_FIELDS
                    ),
                    ...{
                        id: undefined,
                        store_product_id: storeProductId,
                        product_variation_id: productVariation.id,
                        product_id: productVariation.product_id,
                        barcode: CommonUtil.getBarcode(),
                        sku: CommonUtil.getProductSKU(),
                        created_at: undefined,
                        updated_at: undefined,
                        thumb: undefined,
                        variation_index: JSON.stringify(
                            productVariation.variation_index
                        ),
                        store_product_image_id:
                            storeProductImages?.find(
                                (item) =>
                                    item.product_image_id ==
                                    productVariation.product_image_id
                            )?.store_product_image_id ??
                            storeProductImages[0].store_product_image_id,
                        retail_price: CalcRetailPrice(
                            user,
                            productVariation.origin_supplier_price
                        ),
                    },
                })
            ),
            { trx }
        )

        await Product.increateNumberOfImport(product_id, { trx })

        return {
            product_id: storeProductId,
        }
    })

    return result
}

exports.sellerDuplicateStoreProduct = async ({ store_product_id }, user) => {
    const storeProductData = await StoreProduct.getStoreProductDetailOnly(
        store_product_id,
        {
            status: STATUS.ACTIVE,
        }
    )
    if (!storeProductData?.id) throw new Error('product_not_found')
    const { variations, store_product_images, ...product } = storeProductData

    // console.log('product = ', product)

    const result = await knex.transaction(async (trx) => {
        const newProduct = {
            ..._.pick(product, StoreProduct.FULL_FIELDS),
            ...{
                id: undefined,
                created_at: undefined,
                // store_id: undefined,
                shop_product_id: undefined,
                // platform: undefined,
                tenant_id: user.tenant_id,
                product_stock_id: product.product_stock_id,
                sku: CommonUtil.getProductSKU(),
                thumb: JSON.stringify(product.thumb),
                tags: JSON.stringify(product.tags),
                primary_cat_metadata: JSON.stringify(
                    product.primary_cat_metadata
                ),
                platform_extra_attributes: JSON.stringify(
                    product.platform_extra_attributes
                ),
                top_category: product.top_category.id,
            },
        }
        // console.log('newProduct = ', newProduct)

        const [newStoreProductId] = await StoreProduct.insert(newProduct, {
            trx,
        })

        const storeProductImagesMapped = await Promise.all(
            store_product_images.map(
                async (productImage) => {
                    const [newStoreImageId] = await StoreProductImage.insert(
                        removeEmpty({
                            ...productImage,
                            ...{
                                id: undefined,
                                // product_image_id: productImage.id,
                                store_product_id: newStoreProductId,
                                created_at: undefined,
                            },
                        })
                    )

                    return {
                        // product_image_id: productImage.id,
                        // store_product_image_id: newStoreImageId,
                        old_store_product_image_id: productImage.id,
                        new_store_product_image_id: newStoreImageId,
                    }
                },
                { trx }
            )
        )

        await StoreProductVariation.upsertMany(
            variations.map((productVariation) =>
                removeEmpty({
                    ..._.pick(
                        productVariation,
                        StoreProductVariation.FULL_FIELDS
                    ),
                    ...{
                        id: undefined,
                        store_product_id: newStoreProductId,
                        sku: CommonUtil.getProductSKU(),
                        barcode: CommonUtil.getBarcode(),
                        created_at: undefined,
                        updated_at: undefined,
                        // store_id: undefined,
                        shop_product_variation_id: undefined,
                        // platform: undefined,
                        platform_extra_attributes: JSON.stringify(
                            product.platform_extra_attributes
                        ),
                        // variation_index: JSON.stringify(
                        //     productVariation.variation_index
                        // ),
                        store_product_image_id: storeProductImagesMapped?.find(
                            (storeProductImageMapped) =>
                                storeProductImageMapped.old_store_product_image_id ===
                                productVariation.store_product_image_id
                        )?.new_store_product_image_id,
                    },
                })
            ),
            { trx }
        )

        return {
            product_id: newStoreProductId,
        }
    })

    return result
}

exports.updateStoreProduct = async (
    user,
    {
        variations,
        id,
        store_product_images_ids,
        primary_cat_metadata,
        tags,
        platform_extra_attributes,
        number_of_variation,
        ...body
    },
    currentProduct
) => {
    const result = await knex.transaction(async (trx) => {
        if (body.has_variation === false) {
            body.number_of_variation = 0
            const defaultVariation = variations[0]
            if (_.isEmpty(variations)) throw new Error('invalid_variation')
            if (!defaultVariation)
                throw new Error('default_variation_not_found')
        }
        if (number_of_variation === 0 || number_of_variation) {
            body.number_of_variation = number_of_variation
        }
        if (primary_cat_metadata)
            body.primary_cat_metadata = JSON.stringify(primary_cat_metadata)
        if (tags) body.tags = JSON.stringify(tags)

        if (body.attributes) body.attributes = JSON.stringify(body.attributes)

        let variationExtraAttrs
        if (!_.isEmpty(platform_extra_attributes)) {
            //  trường cho variation: "is_sale_prop": 1 Vả "attribute_type": "sku”
            body.platform_extra_attributes = JSON.stringify(
                platform_extra_attributes.filter(
                    (i) => !(i.is_sale_prop === 1 && i.attribute_type === 'sku')
                )
            )
            variationExtraAttrs = platform_extra_attributes.filter(
                (i) => i.is_sale_prop === 1 && i.attribute_type === 'sku'
            )
        }

        const updateProductResult = await StoreProduct.updateById(
            id,
            StoreProduct.reformat(body),
            {
                trx,
            }
        )

        let thumbProductImageId
        if (
            body.thumb &&
            body.thumb.location != currentProduct.thumb?.location
        ) {
            thumbProductImageId =
                await StoreProductImage.updateThumbToProductImage(
                    id,
                    body.thumb,
                    user
                )
        }

        if (_.isEmpty(variations)) {
            // eslint-disable-next-line no-param-reassign
            variations = currentProduct.variations
        }

        if (_.isEmpty(variations)) throw new Error('invalid_product_variation')

        const variationIds = variations.filter((i) => !!i.id).map((i) => i.id)

        const variationsInDB = await StoreProductVariation.getManyByIds(
            variationIds
        )

        if (variationIds.length !== variationsInDB.length) {
            throw new Error('invalid_variation_id')
        }

        // TODO: update product variations
        const variationsUpdateData = variations.map((variation) => {
            variation.store_product_id = id
            if (!variation.store_product_image_id && thumbProductImageId) {
                variation.store_product_image_id = thumbProductImageId
            }

            console.log(
                'variation.store_product_image_id = ',
                variation.store_product_image_id
            )

            if (variation.id) variation.id = variation.id.toString()

            if (variation.id && variation.barcode) {
                delete variation.barcode
            }

            if (!variation.id && !variation.barcode) {
                variation.barcode = CommonUtil.getBarcode()
            }

            if (!_.isEmpty(variationExtraAttrs)) {
                variation.platform_extra_attributes = variationExtraAttrs
            }

            if (variation.attributes)
                variation.attributes = JSON.stringify(variation.attributes)

            if (variation.variation_index)
                variation.variation_index = JSON.stringify(
                    variation.variation_index
                )

            if (variation.platform_extra_attributes)
                variation.platform_extra_attributes = JSON.stringify(
                    variation.platform_extra_attributes
                )

            return removeEmpty(variation)
        })

        await StoreProductVariation.upsertMany(variationsUpdateData, {
            trx,
        })

        // TODO: update product image
        if (store_product_images_ids)
            await updateStoreProductImages(
                currentProduct,
                store_product_images_ids,
                {
                    trx,
                }
            )

        return {
            id,
        }
    })

    AuditLog.addStoreProductLogAsync(currentProduct.id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        current_data: currentProduct,
        change_to_data: { id, store_product_images_ids, variations, ...body },
    })

    return result
}

const updateStoreProductImages = async (
    currentProduct,
    product_images_ids,
    { trx } = {}
) => {
    const currentProductImageIds = currentProduct.store_product_images
        ?.filter((img) => !img?.is_thumb)
        .map((image) => image.id.toString())

    const imageIdsDelete = _.difference(
        currentProductImageIds,
        product_images_ids
    )

    const imageIdsAdd = _.difference(product_images_ids, currentProductImageIds)
    if (!_.isEmpty(imageIdsDelete)) {
        await StoreProductImage.updateManyByIds(
            imageIdsDelete,
            {
                is_deleted: true,
            },
            { trx }
        )
    }

    if (!_.isEmpty(imageIdsAdd)) {
        await StoreProductImage.updateManyByIds(
            imageIdsAdd,
            {
                is_deleted: false,
                store_product_id: currentProduct.id,
            },
            { trx }
        )
    }
}

exports.deleteStoreProductSelected = async (storeProductId) => {
    useMyTrx(null, async (trx) => {
        await StoreProductImage.delete(
            {
                store_product_id: storeProductId,
            },
            { trx }
        )
        await StoreProductVariation.delete(
            {
                store_product_id: storeProductId,
            },
            { trx }
        )
        await StoreProduct.delete(
            {
                id: storeProductId,
            },
            { trx }
        )
    })
        .then(() =>
            Logger.debug('[deleteStoreProductSelected] Deleted complete')
        )
        .catch((err) =>
            Logger.error(
                '[deleteStoreProductSelected] Trx was rolled back',
                err
            )
        )
}

exports.sellerCloneProductStockToStoreProduct = async ({ product_stock_id }, user) => {
    const productData = await Product.getProductStockDetailOnly(product_stock_id, {
        status: STATUS.ACTIVE,
        publish_status: PRODUCT_PUBLISH_STATUS.ACTIVE,
    })
    if (!productData?.id) throw new Error('product_not_found')
    const { variations, product_images, attributes, ...product } = productData

    // update product retail price based on setting
    const result = await useMyTrx(null, async (trx) => {
        const newProduct = {
            ..._.pick(product, StoreProduct.FULL_FIELDS),
            ...{
                id: undefined,
                sku: CommonUtil.getProductSKU(),
                created_at: undefined,
                partner_id: user.partner_id,
                tenant_id: user.tenant_id,
                product_stock_id: product.id,
                thumb: JSON.stringify(product.thumb),
                tags: JSON.stringify(product.tags),
                quantity: product.total_quantity,
                publish_status: STORE_PRODUCT_PUBLISH_STATUS.INACTIVE,
                promotion_id: product?.promotion_id,
                is_promotion: product.is_promotion,
                retail_price: CalcRetailPrice(
                    user,
                    product.origin_supplier_price
                ),
            },
        }

        const [storeProductId] = await StoreProduct.insert(newProduct, { trx })

        const storeProductImages = await Promise.all(
            product_images.map(
                async (productImage) => {
                    const [newStoreImageId] = await StoreProductImage.insert(
                        removeEmpty({
                            ...productImage,
                            ...{
                                id: undefined,
                                product_id: undefined,
                                partner_id: user.partner_id,
                                store_product_id: storeProductId,
                                product_image_id: productImage.id,
                                created_at: undefined,
                            },
                        })
                    )

                    return {
                        product_image_id: productImage.id,
                        store_product_image_id: newStoreImageId,
                    }
                },
                { trx }
            )
        )

        await StoreProductVariation.upsertMany(
            variations.map((productVariation) =>
                removeEmpty({
                    ..._.pick(
                        productVariation,
                        StoreProductVariation.FULL_FIELDS
                    ),
                    ...{
                        id: undefined,
                        store_product_id: storeProductId,
                        product_variation_stock_id: productVariation.id,
                        product_stock_id: productVariation.product_stock_id,
                        barcode: CommonUtil.getBarcode(),
                        sku: CommonUtil.getProductSKU(),
                        created_at: undefined,
                        updated_at: undefined,
                        thumb: undefined,
                        variation_index: JSON.stringify(
                            productVariation.variation_index
                        ),
                        store_product_image_id:
                            storeProductImages?.find(
                                (item) =>
                                    item.product_image_id ==
                                    productVariation.product_image_id
                            )?.store_product_image_id ??
                            storeProductImages[0].store_product_image_id,
                        retail_price: CalcRetailPrice(
                            user,
                            productVariation.origin_supplier_price
                        ),
                    },
                })
            ),
            { trx }
        )

        await Product.increateNumberOfImport(product.product_id, { trx })

        return {
            product_id: storeProductId,
        }
    })

    return result
}

exports.syncAddProductStock = async (newProduct, user) => {
    const { variations, ...product } = newProduct
    if (variations.length === 0) {
        variations.push({
            thumb: product.thumb,
            price: product.price,
            option_1: product.option_1,
            option_2: product.option_2,
            option_3: product.option_3,
        })
    }
    const product_images = variations.reduce((prev, curr) => {
        if (prev.filter(item => item.store_image_url === curr.thumb).length === 0) {
            prev.push({
                store_image_url: curr.thumb
            })
        }
        return prev
    },
        [{
            store_image_url: newProduct.thumb,
            is_thumb: true,
        }]
    )

    const result = await useMyTrx(null, async (trx) => {
        const newProduct = {
            id: undefined,
            sku: CommonUtil.getProductSKU(),
            created_at: undefined,
            partner_id: user.partner_id,
            tenant_id: user.tenant_id,
            description: product.description,
            short_description: product.short_description,
            thumb: {
                origin: product.thumb
            },
            publish_status: STORE_PRODUCT_PUBLISH_STATUS.INACTIVE,
            status: STATUS.ACTIVE,
            retail_price: product.price,
            option_1: product.option_1,
            option_2: product.option_2,
            option_3: product.option_3,
            name: product.name,
            has_variation: variations.length > 1,
            number_of_variation: variations.length,
        }

        const [storeProductId] = await StoreProduct.insert(newProduct, { trx })

        const storeProductImages = await Promise.all(
            product_images.map(
                async (productImage) => {
                    const [newStoreImageId] = await StoreProductImage.insert(
                        removeEmpty({
                            ...productImage,
                            ...{
                                id: undefined,
                                product_id: undefined,
                                partner_id: user.partner_id,
                                store_product_id: storeProductId,
                                created_at: undefined,
                            },
                        })
                    )

                    return {
                        store_image_url: productImage.store_image_url,
                        store_product_image_id: newStoreImageId,
                    }
                },
                { trx }
            )
        )

        await StoreProductVariation.upsertMany(
            variations.map((productVariation) =>
            ({
                id: undefined,
                store_product_id: storeProductId,
                barcode: CommonUtil.getBarcode(),
                sku: CommonUtil.getProductSKU(),
                created_at: undefined,
                updated_at: undefined,
                thumb: productVariation.thumb,
                store_product_image_id:
                    storeProductImages?.find(
                        (item) =>
                            item.store_image_url ==
                            productVariation.thumb
                    )?.store_product_image_id ??
                    storeProductImages[0].store_product_image_id,
                retail_price: productVariation.price,
                option_1: productVariation.option_1,
                option_2: productVariation.option_2,
                option_3: productVariation.option_3,
                box_height_cm: product.box_height_cm,
                box_width_cm: product.box_width_cm,
                box_length_cm: product.box_length_cm,
                weight_grams: product.weight_grams,
            })
            ),
            { trx }
        )

        return {
            product_id: storeProductId,
        }
    })

    return result;
}