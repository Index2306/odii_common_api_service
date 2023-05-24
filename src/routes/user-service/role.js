import RequireRoles from '../../utils/require-permision.helper'

const RoleCtl = require('../../controllers/role')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/roles',
        RequireRoles.adminUser(fastify),
        RoleCtl.getRoles
    )
    fastify.get(
        '/seller/roles',
        // RequireRoles.partnerOwner(fastify),
        RoleCtl.sellerGetRoles
    )
    fastify.post(
        '/admin/roles',
        RequireRoles.supperAdmin(fastify),
        RoleCtl.createRole
    )
    fastify.put(
        '/admin/role/:id',
        RequireRoles.supperAdmin(fastify),
        RoleCtl.updateRole
    )
    fastify.get(
        '/admin/role/:id',
        RequireRoles.supperAdmin(fastify),
        RoleCtl.getRoleDetail
    )
}

module.exports = routes
