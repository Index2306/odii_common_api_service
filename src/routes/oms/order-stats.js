const OrderStatsCtl = require('../../controllers/order-stats')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/seller/order-stats-by-time',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetOrderStatsByTime
    )
    fastify.get(
        '/supplier/order-stats-by-time',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.supplierGetOrderStatsByTime
    )

    fastify.get(
        '/seller/order-stats-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetOrderStatsByDays
    )

    fastify.get(
        '/seller/top-order-stats-of-product',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetOrderStatsOfProduct
    )

    fastify.get(
        '/seller/report-revenue-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetReportRevenue
    )

    fastify.get(
        '/seller/report-cancel-reason-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetReportOrderCancel
    )

    fastify.get(
        '/seller/report-revenue-supplier-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetReportRevenueSupplier
    )

    fastify.get(
        '/seller/statistic-status-product-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetStatisticStatusProduct
    )

    fastify.get(
        '/seller/report-deny-product-by-days',
        RequireRoles.partnerOrder(fastify),
        OrderStatsCtl.sellerGetReportDenyProduct
    )
}

module.exports = routes
