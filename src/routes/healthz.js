const { healthCheck } = require('../controllers/healthz')

async function routes(fastify) {
    fastify.get('/product-service/healthz', healthCheck)
    fastify.get('/oms/healthz', healthCheck)
    fastify.get('/user-service/healthz', healthCheck)
    fastify.get('/common-service/healthz', healthCheck)
    fastify.get('/', () => ({ message: 'hello world' }))
}

module.exports = routes
