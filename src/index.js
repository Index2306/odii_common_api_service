import Logger from './logger'

const fs = require('fs')

if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}
if (!process.env.POSTGRESQL_URL) throw new Error('Config Not Found')
const fastify = require('fastify')({
    disableRequestLogging: true,
    trustProxy: true,
    logger: { prettyPrint: true },
})

console.log('JWT_ACCESS_LIFETIME: ', process.env.JWT_ACCESS_LIFETIME)
console.log('JWT_REFRESH_LIFETIME: ', process.env.JWT_REFRESH_LIFETIME)

const cors = require('fastify-cors')
const multipart = require('fastify-multipart')
const path = require('path')
const autoload = require('fastify-autoload')
const AppError = require('./utils/app-error')
const config = require('./config')
const { redisConnection } = require('./connections/bull-ioredis')

const errorMessages = require('./utils/error-message')

require('./utils/setup-guard')(fastify)
// require('./migrate-db')

fastify.register(multipart, {
    limits: {
        fieldNameSize: 2000, // Max field name size in bytes
        // fieldSize: 100, // Max field value size in bytes
        fields: 10, // Max number of non-file fields
        fileSize: 5000000, // For multipart forms, the max file size in bytes
        files: 5, // Max number of file fields
        headerPairs: 2000, // Max number of header key=>value pairs
    },
})

fastify.register(require('fastify-rate-limit'), {
    global: true,
    redis: redisConnection,
    // max: 1,
    // timeWindow: '1 minute',
    errorResponseBuilder(req, context) {
        return {
            code: 429,
            error: 'Too Many Requests',
            message: `I only allow ${context.max} requests per ${context.after} to this link.`,
            date: Date.now(),
            expiresIn: context.ttl,
        }
    },
})

fastify.register(autoload, {
    dir: path.join(__dirname, 'routes'),
})

fastify.register(cors, {
    origin: '*',
})

fastify.setErrorHandler((error, request, reply) => {
    console.log('error handler: ', error)

    if (error instanceof AppError) {
        return reply.code(400).send({
            is_success: false,
            error_code: error.message,
            error_message: error.errorMessage,
        })
    }
    // if (error instanceof ValidationError || (Array.isArray(error) && error[0] instanceof ValidationError)) {
    //     return res.status(400).json({
    //         error_code: 'VALIDATION_ERROR',
    //         error_msg: error,
    //     });
    // }

    reply.code(400).send({
        is_success: false,
        error_code: error.message,
        error_message: errorMessages[error.message],
    })
})

// HOOK
fastify.addHook('preParsing', async (request) => {
    request.odii_source = request?.headers?.['x-source']
})

const startServer = async () => {
    try {
        Logger.info('COMMON API Service starting!!!')
        await fastify.listen(config.port, '0.0.0.0')
        Logger.info(`API Service listen on : ${config.port}`)
        console.log('API Service listen on : ', config.port)
        console.log('version: 22.1.5')
    } catch (error) {
        Logger.error('API Service start error', error)
        fastify.log.error(error)
        process.exit(1)
    }
}

startServer()
