import RequireRoles from '../../utils/require-permision.helper'

const TenantCtl = require('../../controllers/tenant')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/seller/get-shipments',
        RequireRoles.partnerProduct(fastify),
        TenantCtl.getTenantTransports
    )
}

module.exports = routes
