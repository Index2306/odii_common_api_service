import RequireRoles from '../../utils/require-permision.helper'

const SupplierProductSourceCtl = require('../../controllers/products/product-source')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/supplier/supplier-source',
        RequireRoles.partnerProduct(fastify),
        SupplierProductSourceCtl.getProductSources
    )
    fastify.post(
        '/supplier/supplier-source',
        RequireRoles.partnerProduct(fastify),
        SupplierProductSourceCtl.addProductSource
    )
    fastify.put(
        '/supplier/supplier-source/:id',
        RequireRoles.partnerProduct(fastify),
        SupplierProductSourceCtl.updateProductSource
    )
    fastify.get(
        '/supplier/supplier-source/:id',
        RequireRoles.partnerProduct(fastify),
        SupplierProductSourceCtl.getSupplierProductSourceDetail
    )
}

module.exports = routes
