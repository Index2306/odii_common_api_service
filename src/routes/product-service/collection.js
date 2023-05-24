const CollectionCtl = require('../../controllers/collection')

async function routes(fastify) {
    fastify.post('/collection', CollectionCtl.createCollection)
    fastify.post('/collection/:id/collect', CollectionCtl.collectProduct)
    fastify.put('/collection/:id', CollectionCtl.updateCollection)
    fastify.get('/collections', CollectionCtl.getCollections)
    fastify.get('/collection/:id/products', CollectionCtl.getCollectionProducts)
    fastify.get('/collection/:id', CollectionCtl.getCollection)
}

module.exports = routes
