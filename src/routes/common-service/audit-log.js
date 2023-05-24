import RequireRoles from '../../utils/require-permision.helper'

const AuditLogCtl = require('../../controllers/auditLog')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/audit-logs',
        RequireRoles.supperAdmin(fastify),
        AuditLogCtl.getAuditLogs
    )
    fastify.post(
        '/admin/audit-log',
        RequireRoles.supperAdmin(fastify),
        AuditLogCtl.createAuditLog
    )
    fastify.put(
        '/admin/audit-log/:id',
        RequireRoles.supperAdmin(fastify),
        AuditLogCtl.updateAuditLog
    )
    fastify.get(
        '/admin/audit-log/:id',
        RequireRoles.supperAdmin(fastify),
        AuditLogCtl.getAuditLogDetail
    )
    fastify.delete(
        '/admin/audit-log/:id',
        RequireRoles.supperAdmin(fastify),
        AuditLogCtl.deleteAuditLog
    )
}

module.exports = routes
