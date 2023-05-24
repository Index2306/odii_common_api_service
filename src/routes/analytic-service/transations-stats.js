import RequireRoles from '../../utils/require-permision.helper'

const StatsCtrl = require('../../controllers/statistics')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/transaction-stats-by-days',
        RequireRoles.adminBalance(fastify),
        StatsCtrl.adminGetTransactionStatsByDays
    )
    fastify.get(
        '/seller/transaction-stats-by-days',
        RequireRoles.partnerBalance(fastify),
        StatsCtrl.sellerGetTransactionStatsByDays
    )
    fastify.get(
        '/supplier/product-stats-by-days',
        RequireRoles.partnerProduct(fastify),
        StatsCtrl.supplierGetProductStatsByDays
    )
}

module.exports = routes
