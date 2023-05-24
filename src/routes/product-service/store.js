const StoreCtrl = require('../../controllers/store')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/stores',
        RequireRoles.adminProduct(fastify),
        StoreCtrl.adminGetStores
    )

    fastify.get('/seller/stores', StoreCtrl.sellerGetStores)

    fastify.post(
        '/seller/stores/:id/sync-all-product',
        RequireRoles.partnerStore(fastify),
        StoreCtrl.sellerSyncAllProductOfStore
    )
    fastify.post(
        '/seller/stores/:id/sync-address',
        RequireRoles.partnerStore(fastify),
        StoreCtrl.sellerSyncStoreAddress
    )
    fastify.put(
        '/admin/store/:id',
        RequireRoles.adminProduct(fastify),
        StoreCtrl.updateStore
    )
    fastify.get(
        '/admin/store/:id',
        RequireRoles.adminProduct(fastify),
        StoreCtrl.getStoreDetail
    )
    fastify.get(
        '/seller/store/:id',
        RequireRoles.partnerProductListing(fastify),
        StoreCtrl.sellerGetStoreDetail
    )
    fastify.put(
        '/seller/store/:id/connect',
        RequireRoles.partnerStore(fastify),
        StoreCtrl.sellerConnectStore
    )
    fastify.get(
        '/seller/connect-platform/step-by-step',
        //  RequireRoles.partnerStore(fastify),
        StoreCtrl.sellerConnectPlatform
    )
}

module.exports = routes
