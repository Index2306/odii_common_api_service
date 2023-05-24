const ProductStatsCtl = require('../../controllers/products/product-stats')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/supplier/product-sold-report',
        RequireRoles.partnerOwner(fastify),
        ProductStatsCtl.supplierReportSoldProduct
    )
    fastify.get(
        '/supplier/product-low-quantity-report',
        RequireRoles.partnerOwner(fastify),
        ProductStatsCtl.supplierReportLowQuantityProduct
    )
    fastify.get(
        '/supplier/status-work-report',
        RequireRoles.partnerOwner(fastify),
        ProductStatsCtl.supplierReportStatusWorkDashbroad
    )
    fastify.get(
        '/supplier/status-dashbroad-report',
        RequireRoles.partnerOwner(fastify),
        ProductStatsCtl.supplierReportDashbroad
    )
    fastify.get(
        '/supplier/top-seller-report',
        RequireRoles.partnerOwner(fastify),
        ProductStatsCtl.supplierTopSeller
    )
}

module.exports = routes
