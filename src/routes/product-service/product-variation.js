import RequireRoles from '../../utils/require-permision.helper'

const GetProductCtl = require('../../controllers/products/get-product')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/product/:id/variations',
        RequireRoles.partnerProduct(fastify),
        GetProductCtl.getProductVariations
    )

    fastify.get(
        '/admin/product-variations/:id/detail',
        RequireRoles.adminProduct(fastify),
        GetProductCtl.adminGetProductVariationDetail
    )
}

module.exports = routes
