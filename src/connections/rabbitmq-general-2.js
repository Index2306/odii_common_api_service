// // AMQP libs
// const amqp = require('amqplib/callback_api')
// const { RABBITMQ_SERVERS } = require('../config')
//
// // Declare amqp connections
// let amqpConn = null
// let pubChannel = null
//
// function closeOnErr(err) {
//     if (!err) return false
//     console.error('[AMQP] error', err)
//     amqpConn.close()
//
//     return true
// }
//
// module.exports = {
//     InitConnection: (fnFinish) => {
//         // Start connection with Rabbitmq
//         // eslint-disable-next-line consistent-return
//         amqp.connect(RABBITMQ_SERVERS, (err, conn) => {
//             // If connection error
//             if (err) {
//                 console.error('[AMQP]', err.message)
//
//                 return setTimeout(this, 1000)
//             }
//             conn.on('error', (errCn) => {
//                 console.log('ERROR', errCn)
//                 if (errCn.message !== 'Connection closing') {
//                     console.error('[AMQP] conn error', errCn.message)
//                 }
//             })
//             conn.on('close', () => {
//                 // Reconnect when connection was closed
//                 console.error('[AMQP] reconnecting')
//
//                 return setTimeout(() => {
//                     module.exports.InitConnection(fnFinish)
//                 }, 1000)
//             })
//             // Connection OK
//             console.log('[AMQP] connected')
//             amqpConn = conn
//             // Execute finish function
//             fnFinish()
//         })
//     },
//     StartConsumer: (queue, fnConsumer) => {
//         // Create a channel for queue
//         amqpConn.createChannel((err, ch) => {
//             if (closeOnErr(err)) return
//
//             ch.on('error', (errCh) => {
//                 console.error('[AMQP] channel error', errCh.message)
//             })
//
//             ch.on('close', () => {
//                 console.log('[AMQP] channel closed')
//             })
//
//             // Set prefetch value
//             ch.prefetch(
//                 process.env.CLOUDAMQP_CONSUMER_PREFETCH
//                     ? process.env.CLOUDAMQP_CONSUMER_PREFETCH
//                     : 10
//             )
//
//             function processMsg(msg) {
//                 // Process incoming messages and send them to fnConsumer
//                 // Here we need to send a callback(true) for acknowledge the message or callback(false) for reject them
//                 fnConsumer(msg, (ok) => {
//                     try {
//                         if (ok) {
//                             ch.ack(msg)
//                         } else {
//                             ch.reject(msg, true)
//                         }
//                         // ok ? ch.ack(msg) : ch.reject(msg, true)
//                     } catch (e) {
//                         closeOnErr(e)
//                     }
//                 })
//             }
//
//             // Connect to queue
//             // eslint-disable-next-line no-unused-vars
//             ch.assertQueue(queue, { durable: true }, (errCh, _ok) => {
//                 if (closeOnErr(errCh)) return
//                 // Consume incoming messages
//                 ch.consume(queue, processMsg, { noAck: false })
//                 console.log('[AMQP] Worker is started')
//             })
//         })
//     },
//     StartPublisher: () => {
//         // Init publisher
//         amqpConn.createChannel((err, ch) => {
//             if (closeOnErr(err)) return
//
//             ch.on('error', (errCh) => {
//                 console.error('[AMQP] channel error', errCh.message)
//             })
//
//             ch.on('close', () => {
//                 console.log('[AMQP] channel closed')
//             })
//
//             // Set publisher channel in a var
//             pubChannel = ch
//             console.log('[AMQP] Publisher started')
//         })
//     },
//     PublishMessage: (exchange, routingKey, content, options = {}) => {
//         // Verify if pubchannel is started
//         if (!pubChannel) {
//             console.error(
//                 "[AMQP] Can't publish message. Publisher is not initialized. You need to initialize them with StartPublisher function"
//             )
//
//             return
//         }
//         // convert string message in buffer
//         const message = Buffer.from(content, 'utf-8')
//         try {
//             // Publish message to exchange
//             // options is not required
//             pubChannel.publish(
//                 exchange,
//                 routingKey,
//                 message,
//                 options,
//                 (err) => {
//                     if (err) {
//                         console.error('[AMQP] publish', err)
//                         pubChannel.connection.close()
//
//                         return
//                     }
//                     console.log('[AMQP] message delivered')
//                 }
//             )
//         } catch (e) {
//             console.error('[AMQP] publish', e.message)
//         }
//     },
//     // eslint-disable-next-line no-unused-vars
//     RabbitMQProduceEvent: (topic, message, key) =>
//         new Promise((resolve, reject) => {
//             // eslint-disable-next-line no-unused-vars
//             pubChannel.assertQueue(topic, { durable: true }, (err, _ok) => {
//                 if (closeOnErr(err)) {
//                     reject(err)
//
//                     return
//                 }
//
//                 pubChannel.sendToQueue(
//                     topic,
//                     Buffer.from(JSON.stringify(message)),
//                     {
//                         // RabbitMQ - Khi khởi động lại, tiếp tục chạy
//                         persistent: true,
//                     },
//                     { persistent: true },
//                     (errSend, ok) => {
//                         if (closeOnErr(errSend)) {
//                             reject(errSend)
//
//                             return
//                         }
//
//                         resolve(ok)
//                     }
//                 )
//             })
//         }),
// }
//
// // const rabbitmqLib = require('./rabbitMq')
//
// // function fnConsumer(msg, callback) {
// //     console.log('Received message: ', msg.content.toString())
// //     // we tell rabbitmq that the message was processed successfully
// //     callback(true)
// // }
//
// // InitConnection of rabbitmq
// // rabbitmqLib.InitConnection(() => {
// //     // start consumer worker when the connection to rabbitmq has been made
// //     rabbitmqLib.StartConsumer('test-queue', fnConsumer)
// //     // start Publisher when the connection to rabbitmq has been made
// //     rabbitmqLib.StartPublisher()
// // })
