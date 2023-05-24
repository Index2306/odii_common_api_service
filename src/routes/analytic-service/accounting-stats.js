import RequireRoles from '../../utils/require-permision.helper'

const StatsCtrl = require('../../controllers/statistics')
const AccountingCtrl = require('../../controllers/accounting')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/accounting/balance-stats',
        RequireRoles.adminBalance(fastify),
        AccountingCtrl.adminGetAccountingBalanceStats
    )
    fastify.get(
        '/seller/accounting/balance-stats',
        RequireRoles.partnerBalance(fastify),
        AccountingCtrl.sellerGetAccountingBalanceStats
    )
    fastify.get(
        '/admin/accounting/balance-history',
        RequireRoles.adminBalance(fastify),
        AccountingCtrl.adminGetAccountingBalanceHistory
    )
    fastify.get(
        '/admin/accounting/balance-count',
        RequireRoles.adminBalance(fastify),
        AccountingCtrl.adminGetAccountingBalanceCount
    )
    fastify.get(
        '/admin/accounting/transaction-stats-by-days',
        RequireRoles.adminBalance(fastify),
        AccountingCtrl.adminGetTransactionStatsByDays
    )
}

module.exports = routes
