const CommonCtl = require('../../controllers/common')
const RequireRoles = require('../../utils/require-permision.helper')
const SupplierWareHousingCtl = require('../../controllers/supplierWareHousing')

async function routes(fastify) {
    RequireRoles.checkLogin(fastify)

    fastify.post('/public/upload-image', CommonCtl.uploadImageFileCtl)

    fastify.post('/public/upload-file', CommonCtl.uploadFileCtl)

    fastify.get(
        '/pre-supplier/supplier-warehousing',
        RequireRoles.partnerProduct(fastify),
        SupplierWareHousingCtl.supGetWareHousings
    )
}

module.exports = routes
