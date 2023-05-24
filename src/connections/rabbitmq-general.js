const RabbitMq = require('amqplib')

export const {
    // RABBITMQ_SERVERS,
    KAFKA_TOPIC_LAZADA_ORDER,
    KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
    KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
    KAFKA_TOPIC_STORE_CONNECT,
    KAFKA_ORDER_LAZADA_CONSUMER_GROUP_ID,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC_COMMON,
    // eslint-disable-next-line global-require
} = require('../config')

let rabbitMQProducer
// Kết nối RabbitMQ
async function connectRabbitMQ() {
    try {
        rabbitMQProducer = await RabbitMq.connect(KAFKA_BOOTSTRAP_SERVERS)
        console.info('connect to RabbitMQ success')

        rabbitMQProducer.on('error', (err) => {
            console.log(err)
            setTimeout(connectRabbitMQ, 10000)
        })

        rabbitMQProducer.on('close', () => {
            console.error('connection to RabbitQM closed!')
            setTimeout(connectRabbitMQ, 10000)
        })
    } catch (err) {
        console.error(err)
        setTimeout(connectRabbitMQ, 10000)
    }
}

connectRabbitMQ()

// export const getRabbitMqConnection = async () => {
//     if (!rabbitMQProducer) {
//         await connectRabbitMQ()
//     }
//
//     return rabbitMQProducer
// }

export function rabbitMQProduceEvent(topic, message, key) {
    return new Promise((resolve, reject) => {
        rabbitMQProducer.createChannel().then(async (channel) => {
            await channel.assertQueue(topic)
            const result = await channel.sendToQueue(
                topic,
                Buffer.from(JSON.stringify(message)),
                {
                    // RabbitMQ - Khi khởi động lại, tiếp tục chạy
                    persistent: true,
                }
            )

            if (result) {
                resolve(result)
            } else {
                reject(
                    new Error('An error has occurred while sending message.')
                )
            }
        })
    })
}

// Kafka produccer
// export const kafkaProducer = new Kafka.HighLevelProducer({
//     'client.id': 'kafka',
//     'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
//     'retry.backoff.ms': 200,
//     'message.send.max.retries': 3,
//     'socket.keepalive.enable': true,
//     'queue.buffering.max.messages': 100000,
//     'queue.buffering.max.ms': 50,
//     dr_cb: true,
// })
// kafkaProducer.setValueSerializer((value) => Buffer.from(JSON.stringify(value)))
// kafkaProducer.setKeySerializer((key) => Buffer.from(JSON.stringify(key)))
// // kafkaProducer.on('delivery-report', (err, report) => {
// //     console.log(report)
// // })
// kafkaProducer.connect()
// kafkaProducer.on('ready', () => {
//     console.log('kafkaProducer is READY')
// })
//
// export function kafkaProduceEvent(topic, message, key) {
//     return new Promise((resolve, reject) => {
//         kafkaProducer.produce(
//             topic,
//             null,
//             message,
//             key,
//             Date.now(),
//             (err, offset) => {
//                 if (err) {
//                     return reject(err)
//                 }
//                 resolve(offset)
//             }
//         )
//     })
// }
