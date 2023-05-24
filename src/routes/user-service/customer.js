import RequireRoles from '../../utils/require-permision.helper'
import CustomerCtl from '../../controllers/customer'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get('/admin/customers', CustomerCtl.getCustomers)
    fastify.post('/admin/customer', CustomerCtl.createCustomer)
    fastify.put('/admin/customer/:id', CustomerCtl.updateCustomer)
    fastify.get('/admin/customer/:id', CustomerCtl.getCustomerDetail)
}

module.exports = routes
