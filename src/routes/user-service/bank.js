import RequireRoles from '../../utils/require-permision.helper'

const BankCtrl = require('../../controllers/bank')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    // admin
    fastify.get('/banks', BankCtrl.getBanks)
    fastify.get('/admin/banks', BankCtrl.adminGetBanks)
    fastify.get('/banks-info', BankCtrl.getBanksInfo)
    fastify.post(
        '/banks',
        // RequireRoles.partnerBalance(fastify),
        BankCtrl.createBank
    )
    fastify.put(
        '/bank/:id',
        // RequireRoles.adminBalance(fastify),
        BankCtrl.updateBank
    )
    fastify.get('/bank/:id', BankCtrl.getBankDetail)
    fastify.get('/admin/:id/bank-detail', BankCtrl.adminGetBankDetail)
}

module.exports = routes
