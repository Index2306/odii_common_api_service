const TenantCtl = require('../../controllers/tenant')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/tenant/transports',
        RequireRoles.adminUser(fastify),
        TenantCtl.getTenantTransports
    )
    fastify.get(
        '/tenant/transport/:id',
        RequireRoles.adminUser(fastify),
        TenantCtl.getTenantTransport
    )
    fastify.post(
        '/tenant/transport',
        RequireRoles.adminUser(fastify),
        TenantCtl.createTenantTransport
    )
    fastify.put(
        '/tenant/transport/:id',
        RequireRoles.adminUser(fastify),
        TenantCtl.updateTenantTransport
    )
}

module.exports = routes