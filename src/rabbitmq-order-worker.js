/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable consistent-return */
/* eslint-disable global-require */
/* eslint-disable no-unused-vars */
/* eslint-disable import/prefer-default-export */

import Logger from './logger'

const fs = require('fs')

if (fs.existsSync('.env.local')) {
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    require('dotenv-safe').config({ path: '.env' })
}
if (!process.env.POSTGRESQL_URL) throw new Error('Config Not Found')

const _ = require('lodash')
const RabbitMq = require('amqplib')
const {
    KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
    KAFKA_TOPIC_LAZADA_ORDER,
    rabbitMQProduceEvent,
    KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
    KAFKA_BOOTSTRAP_SERVERS,
} = require('./connections/rabbitmq-general')

const {
    LAZADA_ORDER_STATUS,
    ORDER_FULFILLMENT_STATUS,
    ODII_ORDER_STATUS_NAME,
    ODII_ORDER_STATUS,
    CANCEL_STATUS,
    CONFIRM_STATUS,
    ORDER_PAYMENT_STATUS,
} = require('./constants/oms-status')
const {
    TRANSACTION_STATUS,
    BOT_USER_ID,
    TRANSACTION_METHOD,
    TRANSACTION_TYPE,
    ACC_TYPE,
    TRANSACTION_ACTION,
} = require('./constants/index')
const OrderService = require('./services/order')
const Order = require('./models/order')
const Product = require('./models/product')
const ProductVariation = require('./models/product-variation')
const Supplier = require('./models/supplier')
const Transaction = require('./models/transaction')
const AuditLog = require('./models/audit-log')
const UserRepo = require('./models/user')
const AffiliatePayoutService = require('./services/affiliate_payout.service')
const TransactionService = require('./services/transaction.service')
//
const { knex, useMyTrx } = require('./connections/pg-general')

const handleSyncOrderEvent = async (value) => {
    const orderId = value.id
    Logger.info(`[handleSyncOrderEvent] orderId=${orderId}`)
    const order = await Order.getOrderById(orderId)
    if (!order) {
        Logger.error(`[handleSyncOrderEvent] order not found`)

        return
    }
    if (order.odii_status === order.odii_status_prev) {
        Logger.info(
            `[handleSyncOrderEvent] ignore because order status not changed. ${order.odii_status} ${order.odii_status_prev}`
        )

        return
    }
    const supplier = await Supplier.getSupplier({
        id: order.supplier_id,
    })
    if (!supplier) {
        Logger.error(`[handleSyncOrderEvent] supplier not found:`)

        return
    }
    if (order.odii_status === ODII_ORDER_STATUS.DELIVERED) {
        Logger.info(`[handleSyncOrderEvent] order DELIVERED start handle`)
        const delivered = await useMyTrx(null, async (trx) => {
            await AffiliatePayoutService.insertAffiliatePayout(order.id, order.tenant_id, trx)
            Logger.info(
                `[handleSyncOrderEvent] insertAffiliatePayout id=${order.id} done`
            )
            const actionResult =
                await TransactionService.confirmedDeptTransaction(
                    {
                        order_id: order.id,
                        for_partner_id: supplier.partner_id, // partner của supplier
                        tenant_id: order.tenant_id,
                    },
                    trx
                )
            if (!actionResult) {
                Logger.warn(
                    `[handleSyncOrderEvent] confirmedDeptTransaction failed. Stop processing`
                )

                return false
            }
            Logger.info(
                `[handleSyncOrderEvent] confirmedDeptTransaction id=${
                    order.id
                } result=${JSON.stringify(actionResult)} done`
            )
            AuditLog.addTransactionLogAsync(actionResult.id, {
                source: 'Platform',
                user_id: 1, // mean admin
                action: AuditLog.ACTION_TYPE.UPDATE,
                note: 'Sàn xác nhận đơn hàng đã giao thành công',
                metadata: {
                    order_id: order.id,
                    action_type: 'platform_set_delivered_order',
                },
            })

            return true
        })

        if (
            order.payment_status === ORDER_PAYMENT_STATUS.PENDING &&
            !order.platform
        ) {
            const delivered = await useMyTrx(null, async (trx) => {
                const sellerResult =
                    await TransactionService.confirmedDeptTransaction(
                        {
                            order_id: order.id,
                            for_partner_id: order.partner_id, // partner của seller
                            tenant_id: order.tenant_id,
                        },
                        trx
                    )
                if (!sellerResult) {
                    Logger.warn(
                        `[handleSyncOrderEvent] ConfirmedDeptSeller failed. Stop processing`
                    )

                    return false
                }
                Logger.info(
                    `[handleSyncOrderEvent] confirmedDeptSellerTransaction id=${
                        order.id
                    } result=${JSON.stringify(sellerResult)} done`
                )
                AuditLog.addTransactionLogAsync(sellerResult.id, {
                    source: 'Platform',
                    user_id: 1, // mean admin
                    action: AuditLog.ACTION_TYPE.UPDATE,
                    note: 'Sàn xác nhận đơn hàng đã giao thành công',
                    metadata: {
                        order_id: order.id,
                        action_type: 'platform_set_delivered_order',
                    },
                })

                return true
            })

            if (!delivered) {
                Logger.warn(
                    `[handleSyncOrderEvent] set SELLER_DELIVERED failed. orderId=${order.id}`
                )

                return
            }
        }
        if (!delivered) {
            Logger.warn(
                `[handleSyncOrderEvent] set DELIVERED failed. orderId=${order.id}`
            )

            return
        }
        Logger.info(
            `[handleSyncOrderEvent] set DELIVERED success orderId=${order.id}`
        )
    } else if (order.odii_status === ODII_ORDER_STATUS.CANCELED) {
        Logger.info(
            `[handleSyncOrderEvent] cancel order trigger start=${order.id} platform=${order.platform}`
        )
        let cancelReason = ''
        let fulfillmentStatus = ''
        if (order.platform === 'lazada') {
            const orderItems = await Order.getOrderItems(order.id)
            Logger.debug(
                `[handleSyncOrderEvent] lazada order item orderId=${
                    order.id
                } cnt=${orderItems.length} data=${JSON.stringify(orderItems)}`
            )
            const cancelOrderItem = orderItems.find(
                (item) => item.order_item_status === 'canceled'
            )

            if (cancelOrderItem && cancelOrderItem?.raw_data) {
                Logger.info(
                    `[handleSyncOrderEvent] lazada cancelOrder item=${JSON.stringify(
                        cancelOrderItem
                    )}`
                )
                cancelReason = cancelOrderItem.raw_data?.reason
                if (
                    cancelOrderItem.raw_data?.cancel_return_initiator ===
                    'seller-cancel'
                ) {
                    fulfillmentStatus =
                        ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
                } else if (
                    cancelOrderItem.raw_data?.cancel_return_initiator ===
                    'buyer-cancel'
                ) {
                    fulfillmentStatus = ORDER_FULFILLMENT_STATUS.BUYER_CANCELLED
                } else if (cancelOrderItem.raw_data?.cancel_return_initiator) {
                    fulfillmentStatus =
                        ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED
                }
            } else {
                Logger.info(
                    `[handleSyncOrderEvent] lazada cancelOrder item not found. OrderId=${order.id}`
                )
            }
        } else if (order.platform === 'shopee' && order?.raw_data) {
            cancelReason = order?.raw_data.cancel_reason
            if (order.raw_data?.cancel_by === 'buyer') {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.BUYER_CANCELLED
            } else if (order.raw_data?.cancel_by === 'seller') {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
            } else if (order.raw_data?.cancel_by) {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED
            }
        } else if (order.platform === 'tiktok' && order?.raw_data) {
            cancelReason = order?.raw_data.cancel_reason
            if (order.raw_data?.cancel_by === 'BUYER') {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.BUYER_CANCELLED
            } else if (order.raw_data?.cancel_by === 'SELLER') {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
            } else if (order.raw_data?.cancel_by) {
                fulfillmentStatus = ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED
            }
        } else if (!order.platform) {
            if (
                order.fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
            ) {
                fulfillmentStatus = order.fulfillment_status
            }
        }
        if (fulfillmentStatus === '') {
            Logger.warn(
                `[handleSyncOrderEvent] cancel order but cancel order not match=${order.id}`
            )
        } else if (
            fulfillmentStatus === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED &&
            (order.fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED ||
                order.fulfillment_status ===
                    ORDER_FULFILLMENT_STATUS.SELLER_IGNORED ||
                order.fulfillment_status ===
                    ORDER_FULFILLMENT_STATUS.SUP_CANCELLED ||
                order.fulfillment_status ===
                    ORDER_FULFILLMENT_STATUS.SUP_REJECTED)
        ) {
            Logger.info(
                `[handleSyncOrderEvent] cancel already processed -> ignore. orderId=${order.id} order.fulfillment_status=${order.fulfillment_status}`
            )
        } else if (
            fulfillmentStatus === ORDER_FULFILLMENT_STATUS.SUP_CANCELLED &&
            !order.platform
        ) {
            const trxData = await useMyTrx(null, async (trx) => {
                await TransactionService.cancelAndRefundSellerTransaction(
                    {
                        for_partner_id: order.partner_id, // Hoàn tiền cho seller
                        type: TRANSACTION_TYPE.DEPOSIT,
                        amount:
                            order.payment_status !== ORDER_PAYMENT_STATUS.PAID
                                ? order.total_price * 1 +
                                  order.total_shipping_fee * 1
                                : order.total_price * 1,
                        source: 'supplier',
                        from_trans_action_type:
                            TRANSACTION_ACTION.SELLER_GET_REFUND,
                        from_note: 'Tiền hoàn do Nhà Cung Cấp hủy đơn đơn',
                        order_id: order.id,
                        order_code: order.shop_order_id,
                    },
                    trx
                )

                AuditLog.addOrderLogAsync(order.id, {
                    action: AuditLog.ACTION_TYPE.UPDATE,
                    source: 'supplier',
                    short_description: 'Hoàn tiền do Nhà Cung cấp hủy đơn đơn',
                    metadata: {
                        order_id: order.id,
                        amount:
                            order.payment_status !== ORDER_PAYMENT_STATUS.PAID
                                ? order.total_price * 1 +
                                  order.total_shipping_fee * 1
                                : order.total_price * 1,
                        fulfillment_status: order.fulfillment_status,
                    },
                })

                if (
                    order.fulfillment_status ===
                    ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
                ) {
                    const supplierPartner = await UserRepo.getPartnerUser({
                        user_id: order?.supplier_confirmed_by,
                        is_active: true,
                    })
                    if (supplierPartner && supplierPartner.partner_id > 0) {
                        const cancelDeptTransactionRestult =
                            await TransactionService.cancelDeptTransaction(
                                {
                                    order_id: order.id,
                                    for_partner_id: supplierPartner.partner_id, // partner của supplier
                                },
                                trx
                            )
                        AuditLog.addTransactionLogAsync(
                            cancelDeptTransactionRestult.id,
                            {
                                source: 'supplier',
                                user_id: order?.supplier_confirmed_by,
                                action: AuditLog.ACTION_TYPE.CREATE,
                                note: 'Hủy công nợ cung cấp đơn hàng',
                                metadata: {
                                    amount:
                                        order.payment_status !==
                                        ORDER_PAYMENT_STATUS.PAID
                                            ? order.total_price * 1 +
                                              order.total_shipping_fee * 1
                                            : order.total_price * 1,
                                    order_id: order.id,
                                    action_type: 'supplier_cancelled_order',
                                },
                            }
                        )
                    } else {
                        Logger.warn(
                            `[handleSyncOrderEvent] supplier cancel debt transaction but not found partner id. orderId=${order.id} userId=${order?.supplier_confirmed_by}`
                        )
                    }
                    const cancelSellerDeptTransactionRestult =
                        await TransactionService.cancelDeptTransaction(
                            {
                                order_id: order.id,
                                for_partner_id: order.partner_id, // partner của seller
                            },
                            trx
                        )
                    if (cancelSellerDeptTransactionRestult) {
                        AuditLog.addTransactionLogAsync(
                            cancelSellerDeptTransactionRestult.id,
                            {
                                source: 'seller',
                                user_id: order.seller_confirmed_by,
                                action: AuditLog.ACTION_TYPE.CREATE,
                                note: 'Hủy công nợ cung cấp đơn hàng',
                                metadata: {
                                    amount:
                                        order.payment_status !==
                                        ORDER_PAYMENT_STATUS.PAID
                                            ? order.total_price * 1 +
                                              order.total_shipping_fee * 1
                                            : order.total_price * 1,
                                    order_id: order.id,
                                    action_type: 'supplier_cancelled_order',
                                },
                            }
                        )
                    }
                }

                return true
            })
        } else {
            Logger.info(
                `[handleSyncOrderEvent] Start process cancel order. OrderId=${order.id} total_price=${order.total_price}`
            )
            let fromNode = 'Tiền hoàn do Người bán hủy đơn đơn'
            if (
                fulfillmentStatus === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
            ) {
                fromNode = 'Tiền hoàn do Seller hủy đơn'
            } else if (
                fulfillmentStatus ===
                ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED
            ) {
                fromNode = 'Tiền hoàn do sàn hủy đơn'
            }
            const delivered = await useMyTrx(null, async (trx) => {
                if (order.total_price > 0) {
                    const makeTransactionResult =
                        await TransactionService.cancelAndRefundSellerTransaction(
                            {
                                for_partner_id: order.partner_id,
                                type: TRANSACTION_TYPE.DEPOSIT,
                                amount: order.total_price,
                                source: 'seller',
                                from_trans_action_type:
                                    TRANSACTION_ACTION.SELLER_GET_REFUND,
                                from_note: fromNode,
                                order_id: order.id,
                                order_code: order.shop_order_id,
                            },
                            trx
                        )
                    AuditLog.addTransactionLogAsync(makeTransactionResult.id, {
                        source: 'seller',
                        user_id: 1, // 1 as admin
                        action: AuditLog.ACTION_TYPE.CREATE,
                        note: fromNode,
                        metadata: {
                            amount: order.total_price * 1,
                            order_id: order.id,
                            action_type: TRANSACTION_ACTION.CANCEL_ORDER,
                        },
                    })
                    Logger.info(
                        `[handleSyncOrderEvent] cancelAndRefundSellerTransaction ret=${JSON.stringify(
                            makeTransactionResult
                        )}`
                    )
                }

                // Cancel debt transaction of supplier
                const supplierPartner = await UserRepo.getPartnerUser({
                    user_id: order?.supplier_confirmed_by,
                    is_active: true,
                })
                if (supplierPartner && supplierPartner.partner_id > 0) {
                    const cancelDeptTransactionRestult =
                        await TransactionService.cancelDeptTransaction(
                            {
                                order_id: order.id,
                                for_partner_id: supplierPartner.partner_id, // partner của supplier
                            },
                            trx
                        )
                    Logger.info(
                        `[handleSyncOrderEvent] supplier cancel debt transaction. orderId=${
                            order.id
                        } partner_id=${
                            supplierPartner.partner_id
                        } ret=${JSON.stringify(cancelDeptTransactionRestult)}`
                    )
                    AuditLog.addTransactionLogAsync(
                        cancelDeptTransactionRestult.id,
                        {
                            source: 'platform',
                            user_id: 1, // 1 as admin
                            action: AuditLog.ACTION_TYPE.UPDATE,
                            note: 'Hủy công nợ cung cấp đơn hàng',
                            metadata: {
                                amount: order.total_price * 1,
                                order_id: order.id,
                                action_type: TRANSACTION_ACTION.CANCEL_ORDER,
                            },
                        }
                    )
                } else {
                    Logger.warn(
                        `[handleSyncOrderEvent] supplier cancel debt transaction but not found partner id. orderId=${order.id} userId=${order?.supplier_confirmed_by}`
                    )
                }
                // update order fulfillment status
                const updateResult = await Order.updateOrderById(
                    order.id,
                    {
                        fulfillment_status: fulfillmentStatus,
                        cancel_reason: cancelReason,
                    },
                    {
                        trx,
                    }
                )
                AuditLog.addOrderLogAsync(order.id, {
                    user_id: 1, // mean admin
                    action: AuditLog.ACTION_TYPE.UPDATE,
                    source: 'platform',
                    short_description: fromNode,
                    metadata: {
                        order_id: order.id,
                        amount: order.spend_amount,
                        fulfillment_status: fulfillmentStatus,
                    },
                })

                return true
            })
        }
    }
    AuditLog.addOrderLogAsync(orderId, {
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: 'admin',
        short_description: `Cập nhật trạng thái đơn hàng: ${
            ODII_ORDER_STATUS_NAME[order.odii_status]
        }`,
        metadata: {
            odii_status: order.odii_status,
        },
    })
    await Order.updateOrderById(order.id, {
        odii_status_prev: order.odii_status,
    })
}

const handleDeliveredOrder = async (value) => {
    const odiiOrderId = value.id
    console.log('run handleDeliveredOrder id = ', odiiOrderId)
    // Đơn hàng hoàn thành: trừ qty, update transaction,
    if (!value?.supplier_id) {
        Logger.error(`[RABBITMQ_ORDER] supplier_id not found:`)
        throw new Error('supplier_id not found')
    }
    const supplier = await Supplier.getSupplier({
        id: value?.supplier_id,
    })
    if (!supplier) {
        Logger.error(`[RABBITMQ_ORDER] supplier not found:`)
        throw new Error('supplier not found')
    }

    await useMyTrx(null, async (trx) => {
        await Transaction.updateTransaction(
            {
                order_id: odiiOrderId,
                method: 'debt',
                partner_id: supplier.partner_id,
            },
            { confirm_status: CONFIRM_STATUS.PLATFORM_CONFIRMED },
            { trx }
        )
        // ##### Comment because handle on sale-channel side
        // Giảm qty của produc theo order Item
        // const orderItems = await Order.getOrderItems(odiiOrderId)
        // console.log('orderItems = ', orderItems)
        // Logger.debug(`[RABBITMQ_ORDER] orderItems:`)

        // if (_.isEmpty(orderItems)) throw new Error('invalidOrderItems')
        // for (const orderItem of orderItems) {
        //     await Product.decrementQtyProduct(
        //         orderItem.order_item_product_id,
        //         orderItem.order_item_quantity,
        //         { trx }
        //     )
        //     await ProductVariation.decrementQtyProductVariation(
        //         orderItem.order_item_product_variation_id,
        //         orderItem.order_item_quantity,
        //         { trx }
        //     )
        // }
        await Order.updateOrderById(
            odiiOrderId,
            {
                fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_DELIVERED,
            },
            { trx }
        )
    })

    AuditLog.addOrderLogAsync(odiiOrderId, {
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: 'admin',
        short_description: 'Kênh bán xác nhận giao hàng thành công',
        metadata: {
            fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_DELIVERED,
        },
    })

    return 'cancel delivered'
}

const handleCanceledOrder = async (value) => {
    const odiiOrderId = value.id
    console.log('run handleCanceledOrder id = ', odiiOrderId)
    if (
        !value?.fulfillment_status ||
        value?.fulfillment_status === ORDER_FULFILLMENT_STATUS.PENDING
    ) {
        await Order.updateOrderById(odiiOrderId, {
            fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
            cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
            note: 'Người mua hủy đơn',
        })

        AuditLog.addOrderLogAsync(odiiOrderId, {
            action: AuditLog.ACTION_TYPE.UPDATE,
            source: 'admin',
            short_description: 'Người mua hủy đơn thành công',
            metadata: {
                fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
            },
        })

        return 'cancel success'
    }

    if (
        value?.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
    ) {
        // Hủy + Hoàn tiền lại cho seller
        await OrderService.sellerConfirmOrder(odiiOrderId, {
            fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
            cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
            note: 'Người mua hủy đơn',
            source: 'admin',
        })
        AuditLog.addOrderLogAsync(odiiOrderId, {
            action: AuditLog.ACTION_TYPE.UPDATE,
            source: 'admin',
            short_description: 'Người mua hủy đơn thành công',
            metadata: {
                fulfillment_status: ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
            },
        })

        return 'cancel success'
    }

    await OrderService.sellerConfirmOrder(odiiOrderId, {
        cancel_status: CANCEL_STATUS.PLATFORM_CANCELLED,
        note: 'Kênh bán đã hủy đơn hàng',
        source: 'admin',
    })
    AuditLog.addOrderLogAsync(odiiOrderId, {
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: 'admin',
        short_description: 'Kênh bán đã hủy đơn hàng',
    })
}

const saveKVLog = async (value) =>
    knex('log_key_value')
        .insert({
            data: JSON.stringify(value),
            key: `consume__${KAFKA_TOPIC_LAZADA_ORDER_UPDATE}`,
        })
        .returning('id')
        .then((result) => {
            console.log('log_key_value result = ', result)
        })
        .catch((err) => {
            console.log('log_key_value error = ', err)
        })

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

// setTimeout(() => {
//     console.log('test function')
//     OrderService.sellerConfirmOrder('377', {
//         fulfillment_status: ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED,
//         note: 'Người mua hủy',
//         source: 'admin',
//     })
// }, 5000)

let connection
// Kết nối RabbitMQ
async function connectRabbitMQ() {
    try {
        connection = await RabbitMq.connect(KAFKA_BOOTSTRAP_SERVERS)
        console.info('connect to RabbitMQ success')
        Logger.info('[rabbitmq-order-worker] connect to RabbitMQ success')

        const channel = await connection.createChannel()
        await channel.assertQueue(KAFKA_TOPIC_LAZADA_ORDER_UPDATE)
        await channel.consume(
            KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
            async (message) => {
                console.log(message.content.toString())
                channel.ack(message)
                try {
                    const value = JSON.parse(message.content.toString())
                    console.log(
                        'on data KAFKA_TOPIC_LAZADA_ORDER_UPDATE = ',
                        value
                    )
                    Logger.debug(
                        `[rabbitmq-order-worker] on data KAFKA_TOPIC_LAZADA_ORDER_UPDATE ${JSON.stringify(
                            value
                        )}`
                    )
                    saveKVLog(value)
                    console.log('value?.shop_status = ', value?.shop_status)
                    if (!value.id) return
                    handleSyncOrderEvent(value)
                    // if (value?.shop_status === LAZADA_ORDER_STATUS.CANCELED) {
                    //     Logger.info(`[rabbitmq-order-worker] CANCELED:`)

                    //     return handleCanceledOrder(value)
                    // }
                    // if (value?.shop_status === LAZADA_ORDER_STATUS.DELIVERED) {
                    //     Logger.info(`[rabbitmq-order-worker] DELIVERED:`)

                    //     return handleDeliveredOrder(value)
                    // }
                } catch (error) {
                    Logger.error(
                        `[rabbitmq-order-worker] error consumer KAFKA_TOPIC_LAZADA_ORDER_UPDATE:`,
                        error
                    )

                    console.log(
                        'errro kafkaConsumer KAFKA_TOPIC_LAZADA_ORDER_UPDATE = ',
                        error
                    )
                }
            }
        )

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
Logger.info(`rabbitmq-order-worker start v1.2`)
connectRabbitMQ()
