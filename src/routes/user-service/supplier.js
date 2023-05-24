import RequireRoles from '../../utils/require-permision.helper'

const SupplierCtl = require('../../controllers/supplier')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/admin/suppliers',
        RequireRoles.adminUser(fastify),
        SupplierCtl.getSuppliers
    )
    fastify.post(
        '/admin/supplier',
        RequireRoles.adminUser(fastify),
        SupplierCtl.createSupplier
    )
    fastify.put(
        '/admin/supplier/:id',
        RequireRoles.adminUser(fastify),
        SupplierCtl.updateSupplier
    )
    fastify.get(
        '/admin/supplier/:id',
        RequireRoles.adminUser(fastify),
        SupplierCtl.getSupplierDetail
    )
    fastify.post(
        '/seller/register-supplier',
        RequireRoles.partnerOwner(fastify),
        SupplierCtl.createSupplierFromUser
    )
    fastify.get(
        '/seller/suggest-suppliers',
        RequireRoles.partnerProduct(fastify),
        SupplierCtl.getSuggestSuppliers
    )
    fastify.get(
        '/seller/suggest-warehousing',
        RequireRoles.partnerProduct(fastify),
        SupplierCtl.getSuggestWarehousing
    )
    fastify.get(
        '/supplier/profile',
        // RequireRoles.partnerOwner(fastify),
        SupplierCtl.supplierProfile
    )
    fastify.put(
        '/supplier/profile',
        // RequireRoles.partnerOwner(fastify),
        SupplierCtl.supplierUpdateProfile
    )
    fastify.put(
        '/supplier/setting',
        // RequireRoles.partnerOwner(fastify),
        SupplierCtl.supplierUpdateSetting
    )
}

module.exports = routes
