const PromotionCtl = require('../../controllers/promotion')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/supplier/promotion',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.getListPromotion
    )

    fastify.get(
        '/supplier/promotion/:id',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.getDetailPromotion
    )

    fastify.get(
        '/supplier/promotion/list-discount/:id',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.getListDisCount
    )

    fastify.post(
        '/supplier/promotion',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.addPromotion
    )

    fastify.post(
        '/supplier/promotion/:id/promotion-product',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.addPromotionProduct
    )

    fastify.put(
        '/supplier/promotion/:id',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.updatePromotion
    )

    fastify.put(
        '/supplier/promotion/:id/option',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.updatePromotionOption
    )

    fastify.put(
        '/supplier/promotion/options',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.updatePromotionOption
    )

    fastify.put(
        '/supplier/promotion/:id/promotional-payment',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.updatePromotionPayment
    )

    fastify.put(
        '/supplier/promotion/publishstate/:id',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.updateState
    )

    fastify.delete(
        '/supplier/promotion/:id',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.deletePromotion
    )

    fastify.delete(
        '/supplier/promotion/:id/option',
        RequireRoles.partnerProduct(fastify),
        PromotionCtl.deletePromotionOption
    )
}

module.exports = routes
