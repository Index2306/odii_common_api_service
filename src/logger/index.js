import winston from 'winston'
import 'winston-daily-rotate-file'

const path = require('path')

const logger = winston.createLogger({
    level: 'debug',
    // format: winston.format.json(),
    format: winston.format.combine(
        winston.format.splat(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
        }),
        // format log
        winston.format.printf((log) => {
            if (log.stack)
                return `[${log.timestamp}][${log.level.toUpperCase()}] ${
                    log.message
                } ${log.stack}`

            return `[${log.timestamp}][${log.level.toUpperCase()}] ${
                log.message
            }`
        })
    ),
    // defaultMeta: { service: 'user-service' },
    transports: [
        // new winston.transports.File({ filename: 'error.log', level: 'error' }),
        // new winston.transports.File({ filename: 'combined.log' }),
        // new winston.transports.File({
        //     level: 'info',
        //     format: winston.format.printf((info) => info.message),
        //     filename: 'testMaxsize.log',
        //     maxsize: 5242880, // 5MB
        // }),
        // new winston.transports.Console({
        //     prettyPrint: true,
        //     format: winston.format.combine(
        //         winston.format.colorize(), // see this
        //         winston.format.printf((info) => `[${info.timestamp}][${info.level}]: ${info.message}`)
        //     ),
        // }),
        new winston.transports.DailyRotateFile({
            filename: 'common-api-%DATE%.log',
            dirname: path.join(__dirname, '../', 'log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '5m',
            maxFiles: '5d',
        }),
    ],
})

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            prettyPrint: true,
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.colorize(), // see this
                winston.format.printf(
                    (info) =>
                        `[${info.timestamp}][${info.level}]: ${info.message}`
                )
            ),
        })
    )
}

// module.exports = logger;

export default logger
