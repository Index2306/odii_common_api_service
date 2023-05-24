/* eslint-disable global-require */
/* eslint-disable no-unused-vars */
/* eslint-disable import/prefer-default-export */
// const Kafka = require('node-rdkafka')
import Logger from './logger'

const RabbitMq = require('amqplib')

const fs = require('fs')

if (fs.existsSync('.env.local')) {
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    require('dotenv-safe').config({ path: '.env' })
}
if (!process.env.POSTGRESQL_URL) throw new Error('Config Not Found')

const {
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC_COMMON,
    KAFKA_TOPIC_STORE_CONNECT,
} = require('./connections/rabbitmq-general')

const {
    LAZADA_ORDER_STATUS,
    ORDER_FULFILLMENT_STATUS,
} = require('./constants/oms-status')
// const Order = require('./models/order')
// const OrderService = require('./services/order')
const CommonService = require('./services/common.service')
const LazadaInternalSvc = require('./services/lazada.service')
const ShopeeInternalSvc = require('./services/shopee.service')

// Kết nối RabbitMQ
async function connectRabbitMQ() {
    try {
        const connection = await RabbitMq.connect(KAFKA_BOOTSTRAP_SERVERS)
        console.info('connect to RabbitMQ success')
        Logger.info('[rabbitmq-common-worker] connect to RabbitMQ success')

        const channel = await connection.createChannel()
        await channel.assertQueue(KAFKA_TOPIC_STORE_CONNECT)
        await channel.consume(KAFKA_TOPIC_STORE_CONNECT, async (data) => {
            // console.log(message.content.toString())
            // channel.ack(message)
            const {
                // topic,
                // partition,
                // offset,
                fields,
            } = data
            try {
                // console.log('data = ', data)
                const value = JSON.parse(data.content.toString())
                // console.log('fro topic = ', topic)
                // console.log('fro topic = ', fields.routingKey)
                Logger.debug(
                    `[rabbitmq-common-worker] on key=${
                        fields.routingKey
                    } data=${JSON.stringify(value)}`
                )

                if (
                    fields.routingKey === KAFKA_TOPIC_STORE_CONNECT &&
                    value.store_id
                ) {
                    CommonService.crawlAndSaveStoreLogo(value.store_id)

                    const storeInfo = await CommonService.getInfoStore(
                        value.store_id
                    )
                    if (storeInfo) {
                        const payloadData = {
                            store_id: value.store_id,
                        }
                        if (storeInfo.platform === 'lazada') {
                            LazadaInternalSvc.lzdSyncAllProductOfStore(
                                payloadData
                            )
                        } else if (storeInfo.platform === 'shopee') {
                            ShopeeInternalSvc.shopeeSyncAllProductOfStore(
                                payloadData
                            )
                        }
                    }
                }
            } catch (error) {
                Logger.error(
                    '[rabbitmq-common-worker] errro kafkaConsumer KAFKA_TOPIC_STORE_CONNECT = ',
                    error
                )
                console.log(
                    'errro kafkaConsumer KAFKA_TOPIC_STORE_CONNECT = ',
                    error
                )
                // kafkaConsumer.offsetsStore([
                //     { topic, partition, offset: offset + 1 },
                // ])
            }
        })

        connection.on('error', (err) => {
            console.log(err)
            setTimeout(connectRabbitMQ, 10000)
        })

        connection.on('close', () => {
            console.error('connection to RabbitQM closed!')
            setTimeout(connectRabbitMQ, 10000)
        })
    } catch (err) {
        console.error(err)
        setTimeout(connectRabbitMQ, 10000)
    }
}

connectRabbitMQ()

// Consumer
// export const kafkaConsumer = new Kafka.KafkaConsumer(
//     KAFKA_CONSUMER_COMMON_CONFIG,
//     {
//         'auto.offset.reset': 'earliest',
//     }
// )
//
// kafkaConsumer.connect()
// kafkaConsumer.on('ready', () => {
//     console.log('Consumer ready 2')
// })

// kafkaConsumer
//     .on('ready', () => {
//         kafkaConsumer.subscribe([KAFKA_TOPIC_STORE_CONNECT, KAFKA_TOPIC_COMMON])
//
//         kafkaConsumer.consume()
//     })
//     .on('data', async (data) => {
//         const { topic, partition, offset } = data
//         try {
//             // console.log('data = ', data)
//             const value = JSON.parse(data.value.toString())
//             console.log('fro topic = ', topic)
//             console.log(
//                 'on data [KAFKA_TOPIC_STORE_CONNECT, KAFKA_TOPIC_COMMON]  = ',
//                 value
//             )
//
//             if (topic === KAFKA_TOPIC_STORE_CONNECT && value.store_id) {
//                 CommonService.crawlAndSaveStoreLogo(value.store_id)
//                 LazadaInternalSvc.lzdSyncAllProductOfStore({
//                     store_id: value.store_id,
//                 })
//             }
//         } catch (error) {
//             console.log(
//                 'errro kafkaConsumer KAFKA_TOPIC_STORE_CONNECT = ',
//                 error
//             )
//             // kafkaConsumer.offsetsStore([
//             //     { topic, partition, offset: offset + 1 },
//             // ])
//         }
//     })
