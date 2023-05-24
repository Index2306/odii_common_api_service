import RequireRoles from '../../utils/require-permision.helper'

const StoreProductCtl = require('../../controllers/products/store-product')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post(
        '/seller/store-product/add-product',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.addProductToImportList
    )

    fastify.post(
        '/seller/store-product/sync-product',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.SyncAddProductStockToSeller
    )

    fastify.post(
        '/seller/store-product/duplication-store-product',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.duplicateStoreProduct
    )

    fastify.get(
        '/seller/store-product/listing',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerGetImportProducts
    )

    fastify.get(
        '/seller/store-product/get-ware-house',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerGetWareHouse
    )

    fastify.get(
        '/seller/product-on-sale/listing',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerGetProductsOnSale
    )

    /*
     * Filter products on store by Odii or Platform
     * Date: 28/06/2022
     * Created: TuanTH
     * */
    fastify.get(
        '/seller/product-on-sale/listing-v2',
        RequireRoles.partnerProductListing(fastify),
        StoreProductCtl.sellerGetProductsOnSaleV2
    )
    fastify.get(
        '/seller/raw-store-product/listing',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerGetRawStore
    )
    fastify.get(
        '/seller/raw-store-product/:id',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerGetRawStoreDetail
    )

    fastify.get(
        '/seller/store-product/:id/detail',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.getProductDetail
    )

    fastify.get(
        '/seller/store-product/:id/variations',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.getStoreProductVariations
    )

    fastify.put(
        '/seller/store-product/:id',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerUpdateStoreProduct
    )

    fastify.post(
        '/seller/store-product/:id/push-to-store',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerPushStoreProduct
    )

    fastify.delete(
        '/seller/store-product/:id',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerDeleteStoreProduct
    )

    fastify.post(
        '/seller/edit-store-product-image',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.editProductImage
    )

    fastify.delete(
        '/seller/store-product-image/:id',
        RequireRoles.partnerProduct(fastify),
        StoreProductCtl.sellerDeleteStoreProductImage
    )
}

module.exports = routes
