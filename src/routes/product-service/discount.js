const DiscountCtrl = require('../../controllers/discount')
const RequireRoles = require('../../utils/require-permision.helper')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/supplier/discounts',
        RequireRoles.partnerOwner(fastify),
        DiscountCtrl.supplierGetDiscounts
    )
    fastify.post(
        '/supplier/discounts',
        RequireRoles.partnerOwner(fastify),
        DiscountCtrl.supplierPostDiscounts
    )
    fastify.get(
        '/supplier/discounts/:id',
        RequireRoles.partnerOwner(fastify),
        DiscountCtrl.supplierGetDetailDiscount
    )
    fastify.put(
        '/supplier/discounts/:id',
        RequireRoles.partnerOwner(fastify),
        DiscountCtrl.supplierUpdateDetailDiscount
    )
    fastify.get(
        '/admin/discounts',
        RequireRoles.partnerOwner(fastify),
        DiscountCtrl.adminGetDiscounts
    )
}

module.exports = routes
