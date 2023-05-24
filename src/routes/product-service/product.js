const ProductCtl = require('../../controllers/products/create-product')
const UpdateProductCtl = require('../../controllers/products/update-product')
const GetProductCtl = require('../../controllers/products/get-product')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post(
        '/product/upload-product-image',
        UpdateProductCtl.uploadProductImage
    )

    fastify.post(
        '/product/upload-store-product-image',
        UpdateProductCtl.uploadStoreProductImage
    )

    fastify.post(
        '/product/:product_id/product-image/:product_image_id',
        RequireRoles.partnerProduct(fastify),
        UpdateProductCtl.editProductImage
    )

    fastify.get(
        '/product/:id/product-images',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.getProductImages
    )

    // SUP
    fastify.post(
        '/supplier/product',
        RequireRoles.partnerProduct(fastify),
        ProductCtl.createProduct
    )

    fastify.put(
        '/supplier/product/:id',
        RequireRoles.partnerProduct(fastify),
        UpdateProductCtl.supUpdateProduct
    )

    fastify.put(
        '/supplier/product-quantity/:id',
        RequireRoles.partnerProduct(fastify),
        UpdateProductCtl.supUpdateProductQuantity
    )

    fastify.put(
        '/supplier/product-publishstate/:id',
        RequireRoles.partnerProduct(fastify),
        UpdateProductCtl.supUpdateProductPublishState
    )
    fastify.put(
        '/admin/product/:id',
        RequireRoles.adminProduct(fastify),
        UpdateProductCtl.adminUpdateProduct
    )
    // Clone product
    fastify.post(
        '/supplier/product/clone/:id',
        RequireRoles.partnerProduct(fastify),
        ProductCtl.cloneProduct
    )
    fastify.get(
        '/admin/products',
        RequireRoles.adminProduct(fastify),
        GetProductCtl.adminGetProducts
    )

    fastify.get(
        '/supplier/products',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetProducts
    )

    fastify.get(
        '/supplier/products/listing',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetImportProducts
    )

    fastify.get(
        '/supplier/distributions/listing',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetImportDistributions
    )

    fastify.get(
        '/supplier/products/:id/variations',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetProductVariations
    )

    fastify.get(
        '/supplier/distributions/:id/variations',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetProductVariationsStock
    )

    fastify.get('/products', GetProductCtl.sellerGetProducts)

    fastify.get('/productsV2', GetProductCtl.getProductsV2)

    fastify.get(
        '/product/:id/detail',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.sellerGetProductDetail
    )

    fastify.get(
        '/supplier/product/:id/detail',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetProductDetail
    )

    fastify.get(
        '/admin/product/:id/detail',
        RequireRoles.adminProduct(fastify),
        GetProductCtl.adminGetProductDetail
    )

    fastify.post(
        '/supplier/import-product-by-csv',
        RequireRoles.partnerOwner(fastify),
        GetProductCtl.supplierImportProductByCsv
    )

    fastify.get(
        '/admin/product/:id/timeline',
        RequireRoles.adminProduct(fastify),
        GetProductCtl.adminGetProductTimeLine
    )

    fastify.get(
        '/supplier/product/:id/timeline',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetProductTimeLine
    )
    fastify.delete(
        '/supplier/product/:id',
        RequireRoles.partnerProduct(fastify),
        UpdateProductCtl.supplierDeleteProduct
    )
    fastify.get(
        '/supplier/distribution',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetDistributions
    )

    fastify.get(
        '/supplier/distribution/:id/detail',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.supplierGetDistributionDetail
    )
}

module.exports = routes
