const CategoryCtrl = require('../../controllers/category')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    fastify.get('/categories-listing', CategoryCtrl.getCategoriesListing)
    fastify.get('/categories-listing-v2', CategoryCtrl.getCategoriesListingV2)
    fastify.get(
        '/categories-listing-v2-product',
        CategoryCtrl.getCategoriesListingV2ByProductName
    )
    fastify.get(
        '/categories',
        RequireRoles.partnerProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.getCategoryTree
    )

    fastify.get(
        '/admin/categories',
        RequireRoles.adminProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.adminGetCategoryTree
    )

    fastify.get('/category/:id', CategoryCtrl.getCategoryDetail)

    fastify.post(
        '/category',
        RequireRoles.adminProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.createCategory
    )

    fastify.put(
        '/category/:id',
        RequireRoles.adminProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.updateCategory
    )
    fastify.get('/categories-field', CategoryCtrl.getCategoriesFieldListing)

    fastify.post(
        '/category-field',
        RequireRoles.adminProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.createCategoryField
    )
    fastify.get('/category-field/:id', CategoryCtrl.getCategoryFieldDetail)
    fastify.put(
        '/category-field/:id',
        RequireRoles.adminProduct(fastify, {
            preValidation: fastify.authenticate,
        }),
        CategoryCtrl.updateCategoryField
    )

    fastify.get('/get-store-categories', CategoryCtrl.getStoreCatByOdiiCat)
    fastify.get('/find-store-categories', CategoryCtrl.getStoreCat)
    fastify.get(
        '/get-platform-category-attributes',
        CategoryCtrl.getStoreCatAtrributes
    )
    fastify.get(
        '/search-platform-category',
        CategoryCtrl.searchPlatformCategory
    )
}

module.exports = routes
