import RequireRoles from '../../utils/require-permision.helper'

const SupplierWareHousingCtl = require('../../controllers/supplierWareHousing')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/admin/supplier-warehousing',
        RequireRoles.adminProduct(fastify),
        SupplierWareHousingCtl.getSupplierWareHousings
    )
    fastify.get(
        '/supplier/supplier-warehousing',
        RequireRoles.partnerProduct(fastify),
        SupplierWareHousingCtl.supGetWareHousings
    )
    fastify.post(
        '/supplier/supplier-warehousing',
        RequireRoles.partnerProduct(fastify),
        SupplierWareHousingCtl.createSupplierWareHousing
    )
    fastify.put(
        '/supplier/supplier-warehousing/:id',
        RequireRoles.partnerProduct(fastify),
        SupplierWareHousingCtl.updateSupplierWareHousing
    )
    fastify.get(
        '/admin/supplier-warehousing/:id',
        RequireRoles.supperAdmin(fastify),
        SupplierWareHousingCtl.getSupplierWareHousingDetail
    )
    fastify.get(
        '/supplier/supplier-warehousing/:id',
        RequireRoles.partnerProduct(fastify),
        SupplierWareHousingCtl.supGetSupplierWareHousingDetail
    )
    // fastify.delete(
    //     '/admin/supplier-warehousing/:id',
    //     RequireRoles.supperAdmin(fastify),
    //     SupplierWareHousingCtl.deleteSupplierWareHousing
    // )
}

module.exports = routes
