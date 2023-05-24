const AccountingCtl = require('../../controllers/accounting')
const BalanceCtrl = require('../../controllers/balance')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.put(
        '/accountant/:id/acc-update-status',
        RequireRoles.accountant(fastify),
        AccountingCtl.accountantUpdateStatus
    )
    fastify.put(
        '/accountant/:id/chief-update-status',
        RequireRoles.chiefAccountant(fastify),
        AccountingCtl.chiefAccountantUpdateStatus
    )

    fastify.get(
        '/accountant/overview-stats',
        RequireRoles.accountant(fastify),
        AccountingCtl.overviewStats
    )
    fastify.get(
        '/accountant/supplier/overview-stats',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.overviewStatSupplier
    )
    fastify.get(
        '/accountant/seller/overview-stats',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.overviewStatSeller
    )
    fastify.get(
        '/accountant/debt-by-period',
        RequireRoles.accountant(fastify),
        AccountingCtl.getDebtByPeriod
    )
    fastify.get(
        '/accountant/supplier/debt-by-period',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.getDebtByPeriodSupplier
    )
    fastify.get(
        '/accountant/seller/debt-by-period',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.getDebtByPeriodSeller
    )
    // Detail period
    fastify.get(
        '/accountant/overview-stats-by-period',
        RequireRoles.accountant(fastify),
        AccountingCtl.getDebtByPeriodOverview
    )
    fastify.get(
        '/accountant/partner/overview-stats-by-period',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.getDebtByPeriodOverview
    )
    fastify.get(
        '/accountant/count-order-by-period',
        RequireRoles.accountant(fastify),
        AccountingCtl.getCountOrderByPeriod
    )
    fastify.get(
        '/accountant/partner/count-order-by-period',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.getCountOrderByPeriod
    )
    fastify.get(
        '/accountant/debt-by-period/users',
        RequireRoles.accountant(fastify),
        AccountingCtl.getDebtByPeriodDetailEachUser
    )

    fastify.get(
        '/accountant/debt-period-times',
        // RequireRoles.accountant(fastify),
        AccountingCtl.getDebtPeriodTimeListing
    )

    fastify.get(
        '/accountant/current-debt-period',
        RequireRoles.accountant(fastify),
        AccountingCtl.getCurrDebtPeriod
    )

    fastify.get(
        '/accountant/transactions',
        RequireRoles.accountant(fastify),
        BalanceCtrl.accoutingGetTransactions
    )
    fastify.get(
        '/accountant/partner/transactions',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.accoutingGetTransactions
    )
    fastify.put(
        '/accountant/debt/:id/update-progress',
        RequireRoles.accountant(fastify),
        AccountingCtl.updatePartnerDebtProcess
    )
    fastify.put(
        '/accountant/partner/debt/:id/update-progress',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.updatePartnerDebtProcess
    )
    fastify.post(
        '/accountant/transaction/:id/comment',
        RequireRoles.accountant(fastify),
        AccountingCtl.accountantCommentTransaction
    )
    fastify.post(
        '/accountant/transaction',
        RequireRoles.accountant(fastify),
        AccountingCtl.addNewTransaction
    )

    fastify.post(
        '/accountant/debt/:id/comment',
        RequireRoles.accountant(fastify),
        AccountingCtl.accountantCommentDebt
    )

    fastify.get(
        '/accountant/supplier/export-debt',
        RequireRoles.partnerBalance(fastify),
        AccountingCtl.supplierExportDebt
    )
}

module.exports = routes
