const BalanceCtrl = require('../../controllers/balance')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post(
        '/transactions/create-bank-transfer-transaction',
        BalanceCtrl.createBankTransfTransaction
    )

    fastify.get(
        '/transactions/:id',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getTransactionDetail
    )
    fastify.get(
        '/supplier/transactions/:id',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.supGetTransactionDetail
    )
    fastify.get(
        '/transactions/:id/timeline',
        // RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getTransactionTimeLine
    )
    fastify.get(
        '/seller/transactions',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getTransactions
    )

    fastify.get(
        '/supplier/transactions',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.supplierGetTransactions
    )

    fastify.get(
        '/admin/:id/transactions',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.adminGetDetailUserTransactions
    )

    fastify.post(
        '/transactions/:id/set-transaction-pending',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.setTransactionPending
    )

    fastify.get(
        '/admin/transactions',
        RequireRoles.accountant(fastify),
        BalanceCtrl.adminGetTransactions
    )
    fastify.put(
        '/admin/transactions/:id/update-status-pending-transaction',
        RequireRoles.accountant(fastify),
        BalanceCtrl.updateStatusPendingTransaction
    )

    fastify.put(
        '/seller/transactions/:id',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.sellerRemoveTransaction
    )
    fastify.get(
        '/admin/transactions/:id',
        RequireRoles.accountant(fastify),
        BalanceCtrl.getTransactionDetail
    )
    fastify.get(
        '/admin/partner/transactions/:id',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getTransactionDetail
    )
    // TODO: BALACE
    fastify.get(
        '/admin/balance/:id',
        RequireRoles.adminBalance(fastify),
        BalanceCtrl.adminGetBalanceDetail
    )

    fastify.get(
        '/admin/get-balances-by-userid',
        RequireRoles.adminBalance(fastify),
        BalanceCtrl.adminGetBalancesByUser
    )

    fastify.get(
        '/me/balance',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getBalanceByUser
    )

    fastify.get(
        '/me/supplier/debt-balance-info',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.supplierGetDebtBalance
    )
    fastify.get(
        '/debt/:id/timeline',
        // RequireRoles.partnerBalance(fastify),
        BalanceCtrl.getPartnerDebtTimeLine
    ) 
    fastify.get(
        '/seller/export-list-transaction-history',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.sellerExportListTransactionHistory
    )
    fastify.get(
        '/supplier/export-list-transaction-history',
        RequireRoles.partnerBalance(fastify),
        BalanceCtrl.supplierExportListTransactionHistory
    )
}

module.exports = routes
