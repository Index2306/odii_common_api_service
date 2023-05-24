import NotificationCtl from '../../controllers/notification'
import RequireRoles from '../../utils/require-permision.helper'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/notifications',
        // RequireRoles.partnerOwner(fastify),
        NotificationCtl.getNotifications
    )
    fastify.get(
        '/admin/notifications',
        RequireRoles.supperAdmin(fastify),
        NotificationCtl.adminGetNotifications
    )
    fastify.post(
        '/admin/notifications',
        RequireRoles.supperAdmin(fastify),
        NotificationCtl.adminCreateNotifications
    )
    fastify.get(
        '/admin/notifications/:id',
        RequireRoles.supperAdmin(fastify),
        NotificationCtl.adminGetDetailNotifications
    )
    fastify.put(
        '/admin/message/:id',
        RequireRoles.supperAdmin(fastify),
        NotificationCtl.adminUpdateMessage
    )
    fastify.post(
        '/admin/notification-delete',
        RequireRoles.supperAdmin(fastify),
        NotificationCtl.adminDeleteNotifications
    )
    fastify.put(
        '/message/:id',
        //  RequireRoles.partnerOwner(fastify),
        NotificationCtl.updateMessage
    )
    fastify.put(
        '/notifications',
        // RequireRoles.partnerOwner(fastify),
        NotificationCtl.updateAllMessage
    )
    fastify.get(
        '/count-notifications',
        // RequireRoles.partnerOwner(fastify),
        NotificationCtl.getCountNotifications
    )
   
}

module.exports = routes
