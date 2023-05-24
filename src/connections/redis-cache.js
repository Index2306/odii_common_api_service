const redis = require('redis')
const config = require('../config')

const redisClient = redis.createClient({
    ...config.redis,
    retry_max_delay: 10000,
    connect_timeout: 20000,
    max_attempts: 5,
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with
            // a individual error
            return new Error(
                'ODII redis cache: The server refused the connection'
            )
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands
            // with a individual error
            return new Error('ODII redis cache: Retry time exhausted')
        }
        if (options.attempt > 10) {
            // End reconnecting with built in error
            return undefined
        }
        // reconnect after
        // eslint-disable-next-line newline-before-return
        return Math.min(options.attempt * 100, 3000)
    },
})

redisClient.on('error', (err) => {
    console.log(`ODII redis cache Error ${err}`)
})

redisClient.on('ready', () => {
    console.log(`ODII redis cache ready`)
})

const setObjectEx = (key, timeout, data) => {
    const strData = JSON.stringify(data)

    return new Promise((resolve) => {
        resolve(redisClient.setex(key, timeout, strData))
    })
}

const setObject = (key, data) => {
    const strData = JSON.stringify(data)

    return new Promise((resolve) => {
        resolve(redisClient.set(key, strData))
    })
}

const getValue = (key) =>
    new Promise((resolve) => {
        redisClient.get(key, (err, reply) => {
            if (err) return resolve()
            resolve(reply)
        })
    })

const setValueEx = (key, timeout, str) =>
    new Promise((resolve) => {
        resolve(redisClient.setex(key, timeout, str))
    })

const getObject = (key) =>
    new Promise((resolve) => {
        redisClient.get(key, (err, result) => {
            if (err || !result) return resolve()
            try {
                const obj = JSON.parse(result)
                resolve(obj)
            } catch (error) {
                resolve()
            }
        })
    })

const delObject = (key) =>
    new Promise((resolve) => {
        resolve(redisClient.del(key))
    })

const incrementValue = (key) =>
    new Promise((resolve) => {
        redisClient.incr(key, (err, reply) => {
            if (err) return resolve()
            resolve(reply)
        })
    })

redisClient.setObjectEx = setObjectEx
redisClient.setObject = setObject
redisClient.getObject = getObject
redisClient.delObject = delObject
redisClient.incrementValue = incrementValue
redisClient.getValue = getValue
redisClient.setValueEx = setValueEx

module.exports = {
    redisClient,
    setValueEx,
    getValue,
    incrementValue,
    setObjectEx,
    getObject,
    setObject,
    delObject,
}
