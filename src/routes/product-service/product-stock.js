const ProductStockCtl = require('../../controllers/product-stock')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    
    fastify.put(
        '/supplier/product-stock-state/:id',
        RequireRoles.partnerProduct(fastify),
        ProductStockCtl.UpdateProductStockState
    )

    fastify.put(
        '/supplier/product-stock/:id',
        RequireRoles.partnerProduct(fastify),
        ProductStockCtl.supUpdateProductStock
    )

    fastify.post(
        '/supplier/product-stock',
        RequireRoles.partnerProduct(fastify),
        ProductStockCtl.supInsertProductStock
    )

    fastify.put(
        '/supplier/product-stock-quantity/:id',
        RequireRoles.partnerProduct(fastify),
        ProductStockCtl.supUpdateProductStockQuantity
    )
}

module.exports = routes