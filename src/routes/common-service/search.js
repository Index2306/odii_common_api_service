const SearchCtl = require('../../controllers/search')

async function routes(fastify) {
    fastify.get('/product-to-es/:id', SearchCtl.getProductIdToEs)
    fastify.post('/import-product-to-es', SearchCtl.importProductIdToEs)
    fastify.post(
        '/import-product-cate-to-es',
        SearchCtl.importProductCategoryIdToEs
    )
    fastify.post(
        '/import-platform-cate-to-es',
        SearchCtl.importPlatformCategoryToEs
    )
}

module.exports = routes
