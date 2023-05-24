const debug = require('debug')('odii-api:controller:healthz')
// const AppError = require('../utils/app-error')
const { knex } = require('../connections/pg-general')
const { redisClient } = require('../connections/redis-cache')

const state = { isShutdown: false }

process.on('SIGTERM', () => {
    state.isShutdown = true
})

function initiateGracefulShutdown() {
    debug('initiateGracefulShutdown')
    knex.destroy((err) => {
        process.exit(err ? 1 : 0)
    })
}

async function healthCheck(request, reply) {
    debug('GET /healthz')

    // console.log('request.cookie', request.cookie)
    console.log(request.ip)
    console.log(request.ips)
    console.log(request.hostname)
    console.log(request.raw.connection.remoteAddress)

    // throw new AppError('ERROR_CODE_TEST', { message: 'this is mes test' })

    if (state.isShutdown) {
        debug('GET /healthz NOT OK')
        setTimeout(initiateGracefulShutdown, 2000)

        return reply.code(500).send('not ok')
    }

    try {
        const status = await Promise.all([knex.select(1), redisClient.ping()])
        debug('status', status)

        return {
            message: `ok 26.1.b1`,
            getTime: new Date().getTime(),
            datetoString: new Date().toString(),
            location: {
                id: request.id,
                ip: request.ip,
                ips: request.ips,
                hostname: request.hostname,
            },
        }
    } catch (error) {
        return {
            message: `not ok`,
            getTime: new Date().getTime(),
            datetoString: new Date().toString(),
            location: {
                id: request.id,
                ip: request.ip,
                ips: request.ips,
                hostname: request.hostname,
            },
        }
    }
}

module.exports = {
    healthCheck,
}
