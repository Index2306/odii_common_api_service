// /* eslint-disable global-require */
// /* eslint-disable no-unused-vars */
// /* eslint-disable import/prefer-default-export */
// const Kafka = require('node-rdkafka')
//
// const fs = require('fs')
//
// if (fs.existsSync('.env.local')) {
//     require('dotenv-safe').config({ path: '.env.local' })
// } else if (fs.existsSync('.env')) {
//     require('dotenv-safe').config({ path: '.env' })
// }
// if (!process.env.POSTGRESQL_URL) throw new Error('Config Not Found')
//
// const {
//     KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
//     KAFKA_CONSUMER_UPDATE_ORDER_CONFIG,
//     KAFKA_TOPIC_ODII_ORDER_UPDATE,
//     KAFKA_TOPIC_LAZADA_ORDER,
//     kafkaProduceEvent,
//     KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
//     KAFKA_TOPIC_COMMON,
//     KAFKA_TOPIC_STORE_CONNECT,
//     KAFKA_CONSUMER_COMMON_CONFIG,
// } = require('./connections/kafka-general')
//
// const {
//     LAZADA_ORDER_STATUS,
//     ORDER_FULFILLMENT_STATUS,
// } = require('./constants/oms-status')
// // const Order = require('./models/order')
// const OrderService = require('./services/order')
// const CommonService = require('./services/common.service')
// const LazadaInternalSvc = require('./services/lazada.service')
//
// // Consumer
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
//
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
