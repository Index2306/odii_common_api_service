const OrderCtl = require('../../controllers/order')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post(
        '/seller/order',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.createPersonalOrder
    )

    fastify.post(
        '/seller/order/transport',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerGetTransportFee
    )

    fastify.put(
        '/supplier/orders/:id/confirm-fulfill-personal-order',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierUpdatePersonalOrderStatus
    )

    fastify.get(
        '/admin/orders',
        RequireRoles.adminOrder(fastify),
        OrderCtl.adminGetOrders
    )

    fastify.get(
        '/seller/orders',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerGetOrders
    )

    fastify.get(
        '/supplier/orders',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierGetOrders
    )
    // fastify.get(
    //     '/supplier/orders-total',
    //     RequireRoles.partnerOrder(fastify),
    //     OrderCtl.supplierCountOrderStatus
    // )

    fastify.get(
        '/admin/orders/:id',
        RequireRoles.adminOrder(fastify),
        OrderCtl.adminGetOrder
    )

    fastify.get(
        '/seller/orders/:id',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerGetOrder
    )

    fastify.get(
        '/supplier/orders/:id',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierGetOrder
    )

    fastify.put(
        '/admin/orders/:id/update-status',
        RequireRoles.adminOrder(fastify),
        OrderCtl.adminUpdateOrder
    )

    fastify.put(
        '/supplier/orders/:id/set-invoice-number',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierSetInvoiceNumber
    )

    fastify.put(
        '/supplier/orders/:id/set-pack',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierSetPack
    )

    fastify.put(
        '/supplier/orders/:id/update-traking-info',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierSetTrackingInfo
    )

    fastify.put(
        '/supplier/orders/:id/set-rts',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierSetRTS
    )

    fastify.put(
        '/supplier/orders/:id/other-rts',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierOtherRTS
    )

    fastify.get(
        '/supplier/orders/:id/get-shipping-label',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierGetShippingLabel
    )

    fastify.get(
        '/supplier/orders/:id/get-shipping-provider',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierGetShippingProvider
    )

    fastify.put(
        '/seller/orders/:id/set-delivered',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerUpdateDeliveredStatus
    )

    fastify.get(
        '/supplier/orders/:id/get-shipping-parameter',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierGetShippingParameter
    )

    fastify.post(
        '/supplier/orders/:id/ship-order-and-create-document',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierShipOrderAndCreateDocument
    )

    fastify.get(
        '/supplier/orders/:id/download-shipping-document',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierDownloadShippingDocument
    )

    // Get Reject Reasons platform
    fastify.post(
        '/seller/order/:id/reject-reasons',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.getRejectReasonList
    )
    // cancel order
    fastify.post(
        '/seller/order/:id/cancel-order',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.sellerCancelOrder
    )
    // Print tiktok order
    fastify.get(
        '/supplier/orders/:id/:document_type/print-tiktok-order',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierPrintTiktokOrder
    )
    fastify.get(
        '/supplier/orders/:id/:document_type/print-tiktok-order-pdf',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierPrintTiktokOrderPdfMerge
    )
    fastify.get(
        '/supplier/orders/:id/print-ghtk-label-pdf',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierPrintLabelGHTKPdf
    )
    fastify.post(
        '/supplier/orders/update-status-qr/:id',
        RequireRoles.partnerOrder(fastify),
        OrderCtl.supplierUpdateStatusQR
    )
}

module.exports = routes
