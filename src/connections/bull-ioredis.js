const IORedis = require('ioredis')
const config = require('../config')

const redisConnection = new IORedis({
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000)

        return delay
    },
    reconnectOnError(err) {
        console.log('redis error: ', err)

        return true
    },
    ...config.redis,
})

module.exports = {
    redisConnection,
}
