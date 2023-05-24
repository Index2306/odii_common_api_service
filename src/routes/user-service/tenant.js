const TenantCtl = require('../../controllers/tenant')

async function routes(fastify) {
    fastify.post('/tenant/signup', TenantCtl.signup)
    fastify.post('/tenant/update/:crm_tenant_id/tenant', TenantCtl.updateTenant)
    fastify.post('/tenant/create/subscription', TenantCtl.createSubscription)
    fastify.post('/tenant/cancel/:id/subscription', TenantCtl.cancelSubscription)
    fastify.post('/tenant/update/:crm_subscription_id/subscription', TenantCtl.updateSubscription)
    fastify.get('/tenant/subscription/stats/:id', TenantCtl.getStatsSubscription)
    fastify.get('/tenant/transaction/:sub_id', TenantCtl.getTenantTransaction)
}

module.exports = routes