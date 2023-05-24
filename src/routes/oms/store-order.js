const OrderCtl = require('../../controllers/order')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.put(
        '/seller/orders/:id/change-fulfill-status',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerUpdateStatus
    )
    fastify.put(
        '/seller/orders/change-fulfill-status',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerUpdateMultiOrderStatus
    )
    fastify.put(
        '/supplier/orders/:id/change-fulfill-status',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierUpdateStatus
    )

    fastify.put(
        '/supplier/orders/change-fulfill-status',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierUpdateMultiOrderStatus
    )

    fastify.post(
        '/seller/order/:id/comment',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerCommentOrder
    )

    fastify.post(
        '/seller/order/producer-kafka-test-message',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.producerKafkaMessage
    )

    fastify.get(
        '/seller/order/:id/timeline',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerGetOrderTimeLine
    )

    fastify.get(
        '/seller/order/:id/confirm-info',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerGetOrderConfirmInfo
    )
    fastify.post(
        '/seller/order/import-excel',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerImportOrderByExcel
    )
}

module.exports = routes
