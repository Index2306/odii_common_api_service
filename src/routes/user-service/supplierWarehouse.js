import RequireRoles from '../../utils/require-permision.helper'

const SupplierWarehouseCtl = require('../../controllers/supplierWarehouse')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)
    fastify.get(
        '/supplier/warehouse/import',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.getListImportWarehouse
    )
    fastify.get(
        '/supplier/warehouse/import/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.getDetaiImportWarehouse
    )
    fastify.delete(
        '/supplier/warehouse/import/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.cancelImportWarehouse
    )
    fastify.post(
        '/supplier/warehouse/import/create',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.createImportWarehouse
    )
    fastify.put(
        '/supplier/warehouse/import/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.upsertImportWarehouse
    )
    fastify.put(
        '/supplier/warehouse/import/state/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.updateWarehouseImportState
    )

    fastify.get(
        '/supplier/warehouse/export',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.getListExportWarehouse
    )
    fastify.get(
        '/supplier/warehouse/export/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.getDetaiExportWarehouse
    )
    fastify.get(
        '/supplier/warehouse/recall/:id',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.getListVariationImportWarehouse
    )
    fastify.post(
        '/supplier/warehouse/export/create',
        RequireRoles.partnerWarehouse(fastify),
        SupplierWarehouseCtl.createExportWarehouse
    )
}

module.exports = routes
