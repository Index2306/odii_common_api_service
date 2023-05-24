// /* eslint-disable no-await-in-loop */
// /* eslint-disable no-restricted-syntax */
// /* eslint-disable consistent-return */
// /* eslint-disable global-require */
// /* eslint-disable no-unused-vars */
// /* eslint-disable import/prefer-default-export */
// import Kafka from 'node-rdkafka'
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
// const _ = require('lodash')
// const {
//     KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
//     KAFKA_CONSUMER_UPDATE_ORDER_CONFIG,
//     KAFKA_TOPIC_ODII_ORDER_UPDATE,
//     KAFKA_TOPIC_LAZADA_ORDER,
//     kafkaProduceEvent,
//     KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
// } = require('./connections/kafka-general')
//
// const {
//     LAZADA_ORDER_STATUS,
//     ORDER_FULFILLMENT_STATUS,
//     CANCEL_STATUS,
//     CONFIRM_STATUS,
// } = require('./constants/oms-status')
// const OrderService = require('./services/order')
// const Order = require('./models/order')
// const Product = require('./models/product')
// const ProductVariation = require('./models/product-variation')
// const Supplier = require('./models/supplier')
// const Transaction = require('./models/transaction')
// const AuditLog = require('./models/audit-log')
//
// const { knex, useMyTrx } = require('./connections/pg-general')
//
// // Consumer
// export const kafkaConsumer = new Kafka.KafkaConsumer(
//     KAFKA_CONSUMER_UPDATE_ORDER_CONFIG,
//     {
//         // 'auto.offset.reset': 'earliest',
//     }
// )
//
// kafkaConsumer.connect()
// kafkaConsumer.on('ready', () => {
//     console.log('Consumer ready 2')
// })
//
// const handleDeliveredOrder = async (value) => {
//     const odiiOrderId = value.id
//     console.log('run handleDeliveredOrder id = ', odiiOrderId)
//     // Đơn hàng hoàn thành: trừ qty, update transaction,
//     if (!value?.supplier_id) throw new Error('supplier_id not found')
//     const supplier = await Supplier.getSupplier({
//         id: value?.supplier_id,
//     })
//     if (!supplier) throw new Error('supplier not found')
//
//     await useMyTrx(null, async (trx) => {
//         await Transaction.updateTransaction(
//             {
//                 order_id: odiiOrderId,
//                 method: 'debt',
//                 partner_id: supplier.partner_id,
//             },
//             { confirm_status: CONFIRM_STATUS.PLATFORM_CONFIRMED },
//             { trx }
//         )
//         // Giảm qty của produc theo order Item
//         const orderItems = await Order.getOrderItems(odiiOrderId)
//         console.log('orderItems = ', orderItems)
//         if (_.isEmpty(orderItems)) throw new Error('invalidOrderItems')
//         for (const orderItem of orderItems) {
//             await Product.decrementQtyProduct(
//                 orderItem.order_item_product_id,
//                 orderItem.order_item_quantity,
//                 { trx }
//             )
//             await ProductVariation.decrementQtyProductVariation(
//                 orderItem.order_item_product_variation_id,
//                 orderItem.order_item_quantity,
//                 { trx }
//             )
//         }
//         await Order.updateOrderById(
//             odiiOrderId,
//             {
//                 fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_DELIVERED,
//             },
//             { trx }
//         )
//     })
//
//     AuditLog.addOrderLogAsync(odiiOrderId, {
//         action: AuditLog.ACTION_TYPE.UPDATE,
//         source: 'admin',
//         short_description: 'Kênh bán xác nhận giao hàng thành công',
//         metadata: {
//             fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_DELIVERED,
//         },
//     })
//
//     return 'cancel delivered'
// }
//
// const handleCanceledOrder = async (value) => {
//     const odiiOrderId = value.id
//     console.log('run handleCanceledOrder id = ', odiiOrderId)
//     if (
//         !value?.fulfillment_status ||
//         value?.fulfillment_status === ORDER_FULFILLMENT_STATUS.PENDING
//     ) {
//         await Order.updateOrderById(odiiOrderId, {
//             fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
//             cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
//             note: 'Người mua hủy đơn',
//         })
//
//         AuditLog.addOrderLogAsync(odiiOrderId, {
//             action: AuditLog.ACTION_TYPE.UPDATE,
//             source: 'admin',
//             short_description: 'Người mua hủy đơn thành công',
//             metadata: {
//                 fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
//             },
//         })
//
//         return 'cancel success'
//     }
//
//     if (
//         value?.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
//     ) {
//         // Hủy + Hoàn tiền lại cho seller
//         await OrderService.sellerConfirmOrder(odiiOrderId, {
//             fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
//             cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
//             note: 'Người mua hủy đơn',
//             source: 'admin',
//         })
//         AuditLog.addOrderLogAsync(odiiOrderId, {
//             action: AuditLog.ACTION_TYPE.UPDATE,
//             source: 'admin',
//             short_description: 'Người mua hủy đơn thành công',
//             metadata: {
//                 fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
//             },
//         })
//
//         return 'cancel success'
//     }
//
//     await OrderService.sellerConfirmOrder(odiiOrderId, {
//         cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
//         note: 'Kênh bán đã hủy đơn hàng',
//         source: 'admin',
//     })
//     AuditLog.addOrderLogAsync(odiiOrderId, {
//         action: AuditLog.ACTION_TYPE.UPDATE,
//         source: 'admin',
//         short_description: 'Kênh bán đã hủy đơn hàng',
//     })
// }
//
// const saveKVLog = async (value) =>
//     knex('log_key_value')
//         .insert({
//             data: JSON.stringify(value),
//             key: `consume__${KAFKA_TOPIC_LAZADA_ORDER_UPDATE}`,
//         })
//         .returning('id')
//         .then((result) => {
//             console.log('log_key_value result = ', result)
//         })
//         .catch((err) => {
//             console.log('log_key_value error = ', err)
//         })
//
// kafkaConsumer
//     .on('ready', () => {
//         kafkaConsumer.subscribe([KAFKA_TOPIC_LAZADA_ORDER_UPDATE])
//
//         kafkaConsumer.consume()
//     })
//     .on('data', async (data) => {
//         try {
//             const value = JSON.parse(data.value.toString())
//             console.log('on data KAFKA_TOPIC_LAZADA_ORDER_UPDATE = ', value)
//             saveKVLog(value)
//             console.log('value?.shop_status = ', value?.shop_status)
//             if (!value.id) return
//             if (value?.shop_status === LAZADA_ORDER_STATUS.CANCELED) {
//                 return handleCanceledOrder(value)
//             }
//             if (value?.shop_status === LAZADA_ORDER_STATUS.DELIVERED) {
//                 return handleDeliveredOrder(value)
//             }
//         } catch (error) {
//             console.log(
//                 'errro kafkaConsumer KAFKA_TOPIC_LAZADA_ORDER_UPDATE = ',
//                 error
//             )
//         }
//     })
//
// // setTimeout(() => {
// //     console.log('test function')
// //     OrderService.sellerConfirmOrder('377', {
// //         fulfillment_status: ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED,
// //         note: 'Người mua hủy',
// //         source: 'admin',
// //     })
// // }, 5000)
