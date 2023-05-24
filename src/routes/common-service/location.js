const LocationCtl = require('../../controllers/location')

async function routes(fastify) {
    fastify.get('/locations', LocationCtl.getLocations)
    fastify.get('/location-country', LocationCtl.getLocationCountry)
    // fastify.post('/locations', LocationCtl.createLocation)
    fastify.put('/location/:id', LocationCtl.updateLocation)
    fastify.get('/location/:id', LocationCtl.getLocationDetail)
}

module.exports = routes
