const StatisticCtl = require('../../controllers/statistics')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/seller/statistics/new-order',
        RequireRoles.partnerOrder(fastify),
        StatisticCtl.sellerGetStatisticNewOrder
    )
    fastify.get(
        '/seller/detail-stats-supplier',
        RequireRoles.partnerProduct(fastify),
        StatisticCtl.sellerGetDetailStatsSupplier
    )
    fastify.get(
        '/seller/detail-supplier-warehousing',
        RequireRoles.partnerProduct(fastify),
        StatisticCtl.sellerGetDetailSupplierWareHousing
    )
    fastify.get(
        '/seller/detail-stats-supplier/today',
        RequireRoles.partnerProduct(fastify),
        StatisticCtl.sellerGetDetailStatsSupplierToday
    )
}

module.exports = routes
