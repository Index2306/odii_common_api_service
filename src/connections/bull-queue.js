const { Queue } = require('bullmq')

const { BULL_QUEUES } = require('../constants')
const { redisConnection } = require('./bull-ioredis')

const workerUpdateQueue = new Queue(BULL_QUEUES.WORKER_UPDATE, {
    connection: redisConnection,
})

module.exports = { workerUpdateQueue }
