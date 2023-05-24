const StatisticCtl = require('../../controllers/statistics')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/statistics',
        RequireRoles.adminProduct(fastify),
        StatisticCtl.adminGetStatistics
    )
    fastify.get(
        '/supplier/product-statistics',
        RequireRoles.partnerProduct(fastify),
        StatisticCtl.supplierGetStatistics
    )

    fastify.get(
        '/seller/statistics',
        RequireRoles.partnerProduct(fastify),
        StatisticCtl.sellerGetStatistics
    )

    // fastify.get('/fields', StatisticCtl.getFieldsInfo)
}

module.exports = routes
