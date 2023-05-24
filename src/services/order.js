/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const _ = require('lodash')
const XLSX = require('xlsx')
const { isEmpty, sumBy } = require('lodash')
const { PresignedPost } = require('aws-sdk/clients/s3')
const Order = require('../models/order')
const ProductVariation = require('../models/product-variation')
const ProductVariationStock = require('../models/product-variation-stock')
const WarehouseImportVariation = require('../models/supplierWarehouse')
const Product = require('../models/product')
const ProductStock = require('../models/product-stock')
const Promotion = require('../controllers/promotion')
const Supplier = require('../models/supplier')
const { getBarcode, getImgUrl } = require('../utils/common.util')
const { knex, useMyTrx } = require('../connections/pg-general')
const {
    ORDER_STATUS,
    ORDER_PAYMENT_STATUS,
    ORDER_FULFILLMENT_STATUS,
    // CANCEL_STATUS,
    ODII_ORDER_STATUS,
} = require('../constants/oms-status')
const {
    TRANSACTION_TYPE,
    TRANSACTION_ACTION,
    CURRENCY_CODE: { VND },
    TRANSACTION_METHOD,
    // TRANSACTION_METHOD,
} = require('../constants')
const TransactionService = require('./transaction.service')
const LazadaInternalSvc = require('./lazada.service')
const ShopeeInternalSvc = require('./shopee.service')
const TikTokInternalSvc = require('./tiktok.service')
const GHTKInternalSvc = require('./ghtk.service')
const GHNInternalSvc = require('./ghn.service')
const AuditLog = require('../models/audit-log')
const AppError = require('../utils/app-error')
const { default: logger } = require('../logger')

exports.createPersonalOrder = async (
    user,
    { shipping_address, order_items, source, ...value }
) => {
    console.log('createPersonalOrder', value.tenant_id)
    const orderBody = {
        ...value,
        shipping_address: JSON.stringify(shipping_address),
        status: ORDER_STATUS.OPEN,
        fulfillment_status: ORDER_FULFILLMENT_STATUS.PENDING,
    }
    // eslint-disable-next-line no-unused-expressions
    value?.code
        ? (orderBody.code = value.code)
        : (orderBody.code = getBarcode())
    // eslint-disable-next-line no-unused-expressions
    value?.payment_status
        ? (orderBody.payment_status = value.payment_status)
        : (orderBody.payment_status = ORDER_PAYMENT_STATUS.PAID)

    // eslint-disable-next-line no-unused-expressions
    value?.payment_method
        ? (orderBody.payment_method = value.payment_method)
        : (orderBody.payment_method = 'COD')

    // orderBody.code = getBarcode()
    orderBody.partner_id = user.partner_id
    orderBody.is_map = true
    orderBody.total_product_item = order_items.length

    // eslint-disable-next-line no-unused-expressions
    value?.payment_status
        ? (orderBody.shop_status = value.payment_status)
        : (orderBody.shop_status = ORDER_PAYMENT_STATUS.PAID)

    delete orderBody.type

    let supplierWarehousingData

    const data = await knex.transaction(async (trx) => {
        const returnData = {
            order_items: [],
            ...orderBody,
        }
        const [orderId] = await Order.insertOrder(orderBody, { trx })
        returnData.id = orderId
        for (const orderItem of order_items) {
            let productVariationData
            if (value.type === 'excel') {
                const options = {}
                options.sku = orderItem?.sku
                productVariationData =
                    await ProductVariation.getProductVariationDetailForOrder(
                        0,
                        options
                    )
            } else {
                productVariationData =
                    await ProductVariationStock.getProductVariationStockDetailForOrder(
                        orderItem?.product_variation_stock_id
                    )
            }
            if (!productVariationData)
                throw new Error('product_variation_not_found')

            let product_variation_name = productVariationData.name
            if (!product_variation_name) {
                product_variation_name = _.compact([
                    productVariationData.option_1,
                    productVariationData.option_2,
                    productVariationData.option_3,
                ]).join(', ')
            }

            const orderItemThumb =
                productVariationData.thumb ||
                productVariationData.product?.thumb

            const thumb = getImgUrl(orderItemThumb, {
                size: '300x300',
            })

            if (!productVariationData)
                throw new Error('product_variation_not_found')

            if (!productVariationData.supplier)
                throw new Error('supplier_not_found')
            if (!productVariationData.supplier_warehousing)
                throw new Error('supplier_warehousing_not_found')
            const variationWareHousing =
                productVariationData.supplier_warehousing

            if (!variationWareHousing)
                throw new Error('product_variation_location_not_found')

            if (!supplierWarehousingData) {
                supplierWarehousingData =
                    productVariationData.supplier_warehousing
            }
            if (
                supplierWarehousingData.id !=
                productVariationData.supplier_warehousing.id
            ) {
                throw new AppError('invalid_supplier', {
                    message: 'Các sản phẩm phải cùng 1 nhà cung cấp',
                })
            }

            const orderItemData = {
                order_id: orderId,
                quantity: orderItem?.quantity,
                product_variation_stock_id: productVariationData.id,
                product_id: productVariationData.product.id,
                product_variation_id: productVariationData.product_variation_id,
                product_stock_id: productVariationData.product_stock_id,
                product_name: productVariationData.product.name,
                product_variation_name,
                product_vendor: productVariationData.product.vendor,
                thumb,
                price: productVariationData.origin_supplier_price,
                retail_price:
                    orderItem?.retail_price ||
                    productVariationData.origin_supplier_price,
                origin_supplier_price:
                    productVariationData.origin_supplier_price,
                currency_code: productVariationData.currency_code,
                code: getBarcode(),
            }

            const [orderItemId] = await Order.insertOrderItems(orderItemData, {
                trx,
            })

            await Product.increateNumberOfBooking(orderItemData.product_id, {
                trx,
            })

            returnData.order_items.push({ id: orderItemId, ...orderItemData })
        }

        return returnData
    })

    const dataReturn = await knex.transaction(async (trx) => {
        let totalSupplierPrice = 0
        let totalPricePromotion = 0

        for (const orderItem of data.order_items) {
            let orderItemPromotionAmount = 0
            const promotionPrt = await Order.getPromotionAndOrderSeller(
                orderItem?.order_id,
                orderItem?.id
            )

            const productVariationData =
                await ProductVariationStock.getProductVariationStockDetailForOrder(
                    orderItem?.product_variation_stock_id
                )

            if (!_.isEmpty(promotionPrt)) {
                if (promotionPrt?.prtType === 'product_by') {
                    const finalPrice = await Promotion.disCountFormula(
                        productVariationData.origin_supplier_price,
                        promotionPrt?.value,
                        orderItem?.quantity,
                        !!(promotionPrt?.type === 'percent')
                    )

                    orderItemPromotionAmount =
                        productVariationData.origin_supplier_price - finalPrice

                    totalSupplierPrice += finalPrice
                } else {
                    totalSupplierPrice +=
                        productVariationData.origin_supplier_price *
                        orderItem?.quantity
                }
                await Order.updateOrderItem(
                    { id: orderItem?.id },
                    {
                        promotion_id: promotionPrt?.promotion_id,
                        supplier_promition_amount: orderItemPromotionAmount,
                        payment_status_promotion:
                            promotionPrt?.prtType === 'product_by'
                                ? 'confirmed'
                                : 'pending',
                    }
                )
                totalPricePromotion += orderItemPromotionAmount
            } else {
                totalSupplierPrice +=
                    productVariationData.origin_supplier_price *
                    orderItem?.quantity
            }
        }

        let makeTransactionResult
        const orderUpdateBody = {}
        orderUpdateBody.fulfillment_status =
            ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
        orderUpdateBody.odii_status = ODII_ORDER_STATUS.PENDING
        // if (value.payment_status === ORDER_PAYMENT_STATUS.PAID) {
        makeTransactionResult =
            await TransactionService.makeUserSpendTransaction(
                // trừ tiền fulfill của seller
                {
                    user,
                    for_partner_id: user.partner_id,
                    type: TRANSACTION_TYPE.WITHDRAWAL,
                    amount:
                        value.payment_status === ORDER_PAYMENT_STATUS.PAID
                            ? totalSupplierPrice * 1 +
                            orderBody.total_shipping_fee
                            : totalSupplierPrice * 1,
                    source,
                    order_id: data.id,
                    order_code: orderBody.code,
                    from_trans_action_type: TRANSACTION_ACTION.CONFIRM_ORDER,
                    from_note: 'Thanh toán đơn hàng',
                    tenant_id: value.tenant_id,
                },
                trx
            )
        AuditLog.addOrderLogAsync(data.id, {
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.UPDATE,
            source,
            short_description: 'Người bán Thanh toán đơn hàng',
            metadata: {
                order_id: data.id,
                amount:
                    value.payment_status === ORDER_PAYMENT_STATUS.PAID
                        ? totalSupplierPrice * 1 + orderBody.total_shipping_fee
                        : totalSupplierPrice * 1,
                fulfillment_status: orderBody.fulfillment_status,
            },
        })

        data.makeTransactionResult = makeTransactionResult
        // }
        if (!supplierWarehousingData?.id)
            throw new AppError('invalid_warehousing', {
                message: 'Không tìm thấy thông tin Kho cung cấp',
            })
        await Order.updateOrderById(
            data.id,
            {
                total_items_price: totalSupplierPrice,
                total_price: totalSupplierPrice,
                total_retail_price:
                    value.total_retail_price || totalSupplierPrice,
                seller_confirmed_by: user.id,
                supplier_id: supplierWarehousingData.supplier_id,
                supplier_warehousing_id: supplierWarehousingData.id,
                total_supplier_promotion_amount: totalPricePromotion,
                ...orderUpdateBody,
            },
            { trx }
        )

        // add order note to audit log
        if (!_.isEmpty(value.note) && value.note != '') {
            AuditLog.addOrderLogAsync(data.id, {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.COMMENT,
                source,
                note: value.note,
                short_description: 'Người bán tạo ghi chú',
            })
        }

        return data
    })

    return dataReturn
}

// Seller accept multi order
exports.sellerConfirmMultiOrders = async (
    order_ids,
    { user, note, source, cancel_status, reason_id }
) => {
    console.log('run sellerConfirmMultiOrders')
    const trxData = await useMyTrx(null, async (trx) => {
        const result = []
        order_ids.forEach(async (order_id) => {
            const orderDetail = await Order.getOrderDetail(order_id, {
                ...(user && { partner_id: user?.partner_id }),
            })
            if (!orderDetail) throw new Error('invalid_order')

            const orderItems = orderDetail.order_items
            // check giá của variation
            let totalSupplierPrice = 0
            let totalPricePromotion = 0

            let supplierWarehousingData
            const productIds = []
            // getProductVariationDetail
            for (const orderItem of orderItems) {
                const productVariationData =
                    await ProductVariationStock.getProductVariationStockDetailForOrder(
                        orderItem?.product_variation_stock_id
                    )
                if (!productVariationData)
                    throw new Error('product_variation_not_found')

                if (!productVariationData.supplier)
                    throw new Error('supplier_not_found')
                if (!productVariationData.supplier_warehousing)
                    throw new Error('supplier_warehousing_not_found')
                const variationWareHousing =
                    productVariationData.supplier_warehousing

                if (!variationWareHousing)
                    throw new Error('product_variation_location_not_found')

                if (!supplierWarehousingData) {
                    supplierWarehousingData =
                        productVariationData.supplier_warehousing
                }
                if (
                    supplierWarehousingData.id !==
                    productVariationData.supplier_warehousing.id
                ) {
                    throw new Error(
                        'product_of_order_item_not_same_warehousing'
                    )
                }

                productIds.push(productVariationData.product.id)
            }

            if (!supplierWarehousingData?.id)
                throw new AppError('invalid_warehousing', {
                    message: 'Không tìm thấy thông tin Kho cung cấp',
                })
            let seller_confirmed_by
            if (
                orderDetail.fulfillment_status !==
                ORDER_FULFILLMENT_STATUS.PENDING
            )
                throw new Error('order_fulfillment_status_not_pending')
            // insert transaction: trừ tiền fulfill order của seller

            for (const orderItem of orderItems) {
                let orderItemPromotionAmount = 0
                const promotionPrt = await Order.getPromotionAndOrderSeller(
                    orderItem?.order_id,
                    orderItem?.id
                )
                const productVariationData =
                    await ProductVariationStock.getProductVariationStockDetailForOrder(
                        orderItem?.product_variation_stock_id
                    )

                if (!_.isEmpty(promotionPrt)) {
                    if (promotionPrt?.prtType === 'product_by') {
                        const finalPrice = Promotion.disCountFormula(
                            orderItem?.origin_supplier_price,
                            promotionPrt?.value,
                            orderItem?.quantity,
                            !!(promotionPrt?.type === 'percent')
                        )
                        orderItemPromotionAmount =
                            productVariationData.origin_supplier_price -
                            finalPrice

                        totalSupplierPrice += finalPrice
                    } else {
                        totalSupplierPrice +=
                            productVariationData.origin_supplier_price *
                            orderItem?.quantity
                    }

                    await Order.updateOrderItem(
                        { id: orderItem?.id },
                        {
                            promotion_id: promotionPrt?.promotion_id,
                            supplier_promition_amount: orderItemPromotionAmount,
                            payment_status_promotion:
                                promotionPrt?.prtType === 'product_by'
                                    ? 'confirmed'
                                    : 'pending',
                        }
                    )
                    totalPricePromotion += orderItemPromotionAmount
                } else {
                    totalSupplierPrice +=
                        productVariationData.origin_supplier_price *
                        orderItem?.quantity
                }
            }

            const makeTransactionResult =
                await TransactionService.makeUserSpendTransaction(
                    {
                        user,
                        for_partner_id: user.partner_id,
                        type: TRANSACTION_TYPE.WITHDRAWAL,
                        amount: totalSupplierPrice * 1,
                        source,
                        order_id,
                        order_code: orderDetail.code,
                        from_trans_action_type:
                            TRANSACTION_ACTION.CONFIRM_ORDER,
                        from_note: 'Thanh toán đơn hàng',
                        tenant_id: orderDetail.tenant_id,
                    },
                    trx
                )
            if (!makeTransactionResult)
                throw new Error('update_balance_status_error')
            AuditLog.addOrderLogAsync(order_id, {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.UPDATE,
                source,
                short_description: 'Người bán Thanh toán đơn hàng',
                metadata: {
                    order_id,
                    amount: totalSupplierPrice * -1,
                    fulfillment_status:
                        ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
                },
            })

            await Product.increateFieldsForProducts(
                productIds,
                'number_of_booking',
                { trx }
            )

            // update order status
            const updateResult = await Order.updateOrderById(
                order_id,
                {
                    fulfillment_status:
                        ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
                    cancel_status,
                    total_price: totalSupplierPrice,
                    seller_confirmed_by,
                    note,
                    supplier_id: supplierWarehousingData.supplier_id,
                    supplier_warehousing_id: supplierWarehousingData.id,
                    total_supplier_promotion_amount: totalPricePromotion,
                },
                { trx }
            )
            if (updateResult[0] === 0)
                throw new Error('update_order_status_error')
            result.push({
                makeTransactionResult,
                fulfillment_status: ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
                note,
            })
        })

        return result
    })

    return trxData
}
exports.sellerConfirmOrder = async (
    order_id,
    {
        user,
        fulfillment_status,
        note,
        source,
        cancel_status,
        reason_id,
    }
) => {
    console.log('run sellerConfirmOrder')

    // get order detail
    const orderDetail = await Order.getOrderDetail(order_id, {
        ...(user && { partner_id: user?.partner_id }),
    })
    if (!orderDetail) throw new Error('invalid_order')

    if (!user) {
        user = { partner_id: orderDetail.partner_id }
    }

    const orderItems = orderDetail.order_items

    // check giá của variation
    let totalSupplierPrice = 0
    let totalPricePromotion = 0
    let supplierWarehousingData
    const productIds = []
    // getProductVariationDetail
    for (const orderItem of orderItems) {
        const productVariationData =
            await ProductVariationStock.getProductVariationStockDetailForOrder(
                orderItem?.product_variation_stock_id
            )

        if (!productVariationData)
            throw new Error('product_variation_not_found')

        if (!productVariationData.supplier)
            throw new Error('supplier_not_found')
        if (!productVariationData.supplier_warehousing)
            throw new Error('supplier_warehousing_not_found')
        const variationWareHousing = productVariationData.supplier_warehousing

        if (!variationWareHousing)
            throw new Error('product_variation_location_not_found')

        if (!supplierWarehousingData) {
            supplierWarehousingData = productVariationData.supplier_warehousing
        }
        if (
            supplierWarehousingData.id !==
            productVariationData.supplier_warehousing.id
        ) {
            throw new Error('product_of_order_item_not_same_warehousing')
        }

        productIds.push(productVariationData.product.id)
    }

    if (!supplierWarehousingData?.id)
        throw new AppError('invalid_warehousing', {
            message: 'Không tìm thấy thông tin Kho cung cấp',
        })

    // if (
    //     orderDetail.fulfillment_status === ORDER_FULFILLMENT_STATUS.PENDING &&
    //     fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_IGNORED
    // ) {
    //     await Order.updateOrderById(order_id, {
    //         fulfillment_status,
    //         status: ORDER_FULFILLMENT_STATUS.SELLER_IGNORED,
    //         note,
    //     })

    //     return {
    //         fulfillment_status,
    //         note,
    //     }
    // }
    const trxData = await useMyTrx(null, async (trx) => {
        let seller_confirmed_by
        let makeTransactionResult
        if (fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED) {
            if (
                orderDetail.fulfillment_status !==
                ORDER_FULFILLMENT_STATUS.PENDING
            )
                throw new Error('order_fulfillment_status_not_pending')
            for (const orderItem of orderItems) {
                let orderItemPromotionAmount = 0
                const promotionPrt = await Order.getPromotionAndOrderSeller(
                    orderItem?.order_id,
                    orderItem?.id
                )
                const productVariationData =
                    await ProductVariationStock.getProductVariationStockDetailForOrder(
                        orderItem?.product_variation_stock_id
                    )

                if (!_.isEmpty(promotionPrt)) {
                    if (promotionPrt?.prtType === 'product_by') {
                        const finalPrice = await Promotion.disCountFormula(
                            productVariationData.origin_supplier_price,
                            promotionPrt?.value,
                            orderItem?.quantity,
                            !!(promotionPrt?.type === 'percent')
                        )

                        orderItemPromotionAmount =
                            productVariationData.origin_supplier_price -
                            finalPrice

                        totalSupplierPrice += finalPrice
                    } else {
                        totalSupplierPrice +=
                            productVariationData.origin_supplier_price *
                            orderItem?.quantity
                    }
                    await Order.updateOrderItem(
                        { id: orderItem?.id },
                        {
                            promotion_id: promotionPrt?.promotion_id,
                            supplier_promition_amount: orderItemPromotionAmount,
                            payment_status_promotion:
                                promotionPrt?.prtType === 'product_by'
                                    ? 'confirmed'
                                    : 'pending',
                        }
                    )
                    totalPricePromotion += orderItemPromotionAmount
                } else {
                    totalSupplierPrice +=
                        productVariationData.origin_supplier_price *
                        orderItem?.quantity
                }
            }

            // insert transaction: trừ tiền fulfill order của seller
            makeTransactionResult =
                await TransactionService.makeUserSpendTransaction(
                    {
                        user,
                        for_partner_id: user.partner_id,
                        type: TRANSACTION_TYPE.WITHDRAWAL,
                        amount: totalSupplierPrice * 1,
                        source,
                        order_id,
                        order_code: orderDetail.code,
                        from_trans_action_type:
                            TRANSACTION_ACTION.CONFIRM_ORDER,
                        from_note: 'Thanh toán đơn hàng',
                        tenant_id: orderDetail.tenant_id,
                    },
                    trx
                )
            AuditLog.addOrderLogAsync(order_id, {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.UPDATE,
                source,
                short_description: 'Người bán Thanh toán đơn hàng',
                metadata: {
                    order_id,
                    amount: totalSupplierPrice * -1,
                    fulfillment_status,
                },
            })

            await Product.increateFieldsForProducts(
                productIds,
                'number_of_booking',
                { trx }
            )

            seller_confirmed_by = user.id
        } else if (
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED ||
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_IGNORED
        ) {
            // Send request cancel order to marketplace
            let cancelRet
            if (orderDetail.platform === 'lazada') {
                if (orderItems && orderItems.length > 0) {
                    const allCancel = orderItems.map((item) =>
                        LazadaInternalSvc.lzdSetStatusToCanceled({
                            partner_id: orderDetail.partner_id,
                            platform_shop_id: orderDetail.platform_shop_id,
                            reason_detail: note,
                            reason_id,
                            order_item_id: item.shop_order_item_id,
                        })
                    )
                    cancelRet = await Promise.all(allCancel)
                    logger.info(
                        `[Cancel order LZD] orderId=${order_id} ret=${JSON.stringify(
                            cancelRet
                        )}`
                    )
                    for (const ret of cancelRet) {
                        if (ret?.error_code && ret?.error_message) {
                            throw new Error(ret.error_message)
                        }
                        if (ret?.code !== '0') {
                            throw new Error(ret.code)
                        }
                    }
                }
            } else if (orderDetail.platform === 'shopee') {
                cancelRet = await ShopeeInternalSvc.shopeeCancelOrder({
                    order_id,
                    cancel_reason: reason_id,
                })
                logger.info(
                    `[Cancel order SHOPEE] orderId=${order_id} ret=${JSON.stringify(
                        cancelRet
                    )}`
                )
                if (cancelRet?.error_code && cancelRet?.error_message) {
                    throw new Error(cancelRet.error_message)
                }
                if (cancelRet.error && cancelRet.message) {
                    throw new Error(cancelRet.error_message)
                }
            } else if (orderDetail.platform === 'tiktok') {
                console.log('reason_id', reason_id)
                cancelRet = await TikTokInternalSvc.tikTokCancelOrder({
                    partner_id: orderDetail.partner_id,
                    platform_shop_id: orderDetail.platform_shop_id,
                    shop_order_id: orderDetail.shop_order_id,
                    cancel_reason_key: reason_id,
                })
                logger.info(
                    `[Cancel order TIKTOK] orderId=${order_id} ret=${JSON.stringify(
                        cancelRet
                    )}`
                )
                if (cancelRet?.error_code && cancelRet?.error_message) {
                    throw new Error(cancelRet.error_message)
                }
                if (cancelRet.error && cancelRet.message) {
                    throw new Error(cancelRet.error_message)
                }
            }
            if (
                fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED &&
                orderDetail.fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
            ) {
                makeTransactionResult =
                    await TransactionService.cancelAndRefundSellerTransaction(
                        {
                            user,
                            for_partner_id: user.partner_id,
                            type: TRANSACTION_TYPE.DEPOSIT,
                            amount:
                                orderDetail.payment_status ===
                                    ORDER_PAYMENT_STATUS.PAID
                                    ? orderDetail?.total_price +
                                    parseInt(orderDetail.total_shipping_fee)
                                    : orderDetail?.total_price,
                            source,
                            from_trans_action_type:
                                TRANSACTION_ACTION.SELLER_GET_REFUND,
                            from_note: 'Tiền hoàn do Người bán hủy đơn đơn',
                            order_id: orderDetail.id,
                            order_code: orderDetail.code,
                            tenant_id: orderDetail.tenant_id,
                        },
                        trx
                    )
                AuditLog.addOrderLogAsync(order_id, {
                    user_id: user.id,
                    action: AuditLog.ACTION_TYPE.UPDATE,
                    source,
                    short_description: 'Hoàn tiền do Người bán hủy đơn đơn',
                    metadata: {
                        order_id,
                        amount:
                            orderDetail.payment_status ===
                                ORDER_PAYMENT_STATUS.PAID
                                ? orderDetail?.total_price * 1 +
                                parseInt(orderDetail.total_shipping_fee)
                                : orderDetail?.total_price * 1,
                        fulfillment_status,
                    },
                })
                seller_confirmed_by = null
            }
        } else {
            throw new Error('action_not_supported')
        }
        // update order status
        const updateData = {
            fulfillment_status,
            cancel_status,
            total_price: totalSupplierPrice,
            seller_confirmed_by,
            note,
            supplier_id: supplierWarehousingData.supplier_id,
            supplier_warehousing_id: supplierWarehousingData.id,
            total_supplier_promotion_amount: totalPricePromotion,
        }

        if (
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_IGNORED ||
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
        ) {
            updateData.status = ORDER_FULFILLMENT_STATUS.SELLER_IGNORED
            updateData.odii_status = ODII_ORDER_STATUS.CANCELED
            updateData.fulfillment_status = fulfillment_status
        }
        const updateResult = await Order.updateOrderById(order_id, updateData, {
            trx,
        })
        if (updateResult[0] === 0) throw new Error('update_order_status_error')

        return {
            makeTransactionResult,
            fulfillment_status,
            note,
        }
    })

    return trxData
}

exports.getOrderConfirmInfo = async (order_id, { user }) => {
    // get order detail
    const orderDetail = await Order.getOrderDetail(order_id, {
        // partner_id: user.partner_id,
    })
    if (!orderDetail) throw new Error('invalid_order')
    const orderItems = orderDetail.order_items
    let total_fulfill_price = 0
    let prtData

    for (const orderItem of orderItems) {
        const productVariationData =
            await ProductVariationStock.getProductVariationStockDetail(
                orderItem?.product_variation_stock_id
            )

        if (user?.is_seller && orderDetail.fulfillment_status === 'pending') {
            prtData = await Order.getPromotionAndOrderSeller(
                orderItem?.order_id,
                orderItem?.id
            )
        } else {
            prtData = await Order.getPromotionAndOrder(
                orderItem?.order_id,
                orderItem?.id
            )
        }

        if (!productVariationData)
            throw new Error('product_variation_not_found')

        if (!_.isEmpty(prtData)) {
            if (prtData.prtType === 'product_by') {
                total_fulfill_price = await Promotion.disCountFormula(
                    productVariationData.origin_supplier_price,
                    prtData.value,
                    orderItem?.quantity,
                    !!(prtData?.type === 'percent')
                )
            } else {
                total_fulfill_price +=
                    productVariationData.origin_supplier_price *
                    orderItem?.quantity
            }
        } else {
            total_fulfill_price +=
                productVariationData.origin_supplier_price * orderItem?.quantity
        }
    }

    if (
        orderDetail.payment_status === ORDER_PAYMENT_STATUS.PAID &&
        !orderDetail.platform
    ) {
        total_fulfill_price += parseInt(orderDetail.total_shipping_fee)
    }

    return {
        total_fulfill_price,
        currency_code: orderDetail.currency_code || VND,
        total_product_item: orderDetail.total_product_item,
    }
}

exports.supplierConfirmOrder = async (
    order_id,
    { user, fulfillment_status, note, source, reason_id, supplier_id }
) => {
    // console.log('run sellerConfirmOrder')

    // get order detail
    const orderDetail = await Order.getOrderDetail(order_id, {})
    if (!orderDetail) throw new Error('invalid_order')

    const orderItems = orderDetail.order_items
    // check giá của variation

    for (const orderItem of orderItems) {
        const productVariationData =
            await ProductVariationStock.getProductVariationStockDetail(
                orderItem?.product_variation_stock_id
            )

        if (!productVariationData)
            throw new Error('product_variation_not_found')
    }

    const trxData = await useMyTrx(null, async (trx) => {
        let supplierDeptTransaction
        let updateOrderResult

        if (fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED) {
            supplierDeptTransaction =
                await TransactionService.makeDeptTransaction(
                    {
                        user,
                        to_partner_id: user.partner_id,
                        amount: orderDetail.total_price,
                        source,
                        order_id,
                        order_code: orderDetail.code,
                        action_type: TRANSACTION_ACTION.CONFIRM_ORDER,
                        note: 'Tiền cung cấp đơn hàng',
                        tenant_id: orderDetail.tenant_id,
                    },
                    trx
                )
            await WarehouseImportVariation.insertExportWarehouse(
                {
                    reason: `Xuất đơn hàng ${orderDetail.platform || 'ngoại sàn'}`,
                    user_created_id: user.id,
                    supplier_id: supplier_id,
                    partner_id: user.partner_id,
                    tenant_id: user.tenant_id,
                    order_id: order_id,
                    code: getBarcode(),
                },
                trx
            )
            AuditLog.addTransactionLogAsync(supplierDeptTransaction.id, {
                source,
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.CREATE,
                note: 'Tiền cung cấp đơn hàng của Nhà CC',
                metadata: {
                    amount: orderDetail.total_price,
                    order_id: orderDetail.id,
                    action_type: TRANSACTION_ACTION.CONFIRM_ORDER,
                },
            })

            if (!orderDetail.platform) {
                await TransactionService.makeDeptTransaction(
                    {
                        user,
                        to_partner_id: user.partner_id,
                        amount: orderDetail.total_shipping_fee * 1,
                        source: orderDetail.shipment_provider,
                        order_id,
                        order_code: orderDetail.code,
                        action_type: TRANSACTION_ACTION.SHIPPING_FEE,
                        note: 'Tiền phí vận chuyển',
                        method: TRANSACTION_METHOD.CHECK,
                        tenant_id: orderDetail.tenant_id,
                    },
                    trx
                )
                if (orderDetail.payment_status !== ORDER_PAYMENT_STATUS.PAID) {
                    await TransactionService.makeDeptTransaction(
                        {
                            user,
                            to_partner_id: user.partner_id,
                            amount: orderDetail.total_retail_price * 1,
                            source: orderDetail.shipment_provider,
                            order_id,
                            order_code: orderDetail.code,
                            action_type: TRANSACTION_ACTION.COD,
                            note: 'Thu hộ tiền hàng (bao gồm phí vận chuyển)',
                            method: TRANSACTION_METHOD.CHECK,
                            type: 'cod',
                            tenant_id: orderDetail.tenant_id,
                        },
                        trx
                    )

                    await TransactionService.makeDeptTransaction(
                        {
                            user: {
                                id: orderDetail.partner_id,
                            },
                            to_partner_id: orderDetail.partner_id,
                            amount:
                                orderDetail.total_retail_price * 1 -
                                orderDetail.total_shipping_fee * 1,
                            source: 'seller',
                            order_id,
                            order_code: orderDetail.code,
                            action_type: TRANSACTION_ACTION.CONFIRM_ORDER,
                            note: 'Tiền bán hàng',
                            tenant_id: orderDetail.tenant_id,
                        },
                        trx
                    )
                }
            }
        }

        let refundTransaction
        let cancelDeptTransactionRestult
        let cancelSellerDeptTransactionRestult

        if (
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_REJECTED ||
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
        ) {
            if (
                orderDetail.fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.PENDING
            ) {
                throw new AppError('invalid_fulfillment_status', {
                    message: 'Hành động này cần Người bán xác nhận trước.',
                })
            }
            if (
                orderDetail.fulfillment_status ===
                ORDER_FULFILLMENT_STATUS.PLATFORM_DELIVERED
            ) {
                throw new AppError('invalid_fulfillment_status', {
                    message: 'Đơn hàng đã được giao.',
                })
            }
            // Send request cancel order to marketplace
            let cancelRet
            if (orderDetail.platform === 'lazada') {
                if (orderItems && orderItems.length > 0) {
                    const allCancel = orderItems.map((item) =>
                        LazadaInternalSvc.lzdSetStatusToCanceled({
                            partner_id: orderDetail.partner_id,
                            platform_shop_id: orderDetail.platform_shop_id,
                            reason_detail: note,
                            reason_id,
                            order_item_id: item.shop_order_item_id,
                        })
                    )
                    cancelRet = await Promise.all(allCancel)
                    logger.info(
                        `[Cancel order LZD] orderId=${order_id} ret=${JSON.stringify(
                            cancelRet
                        )}`
                    )
                    for (const ret of cancelRet) {
                        if (ret?.error_code && ret?.error_message) {
                            throw new Error(ret.error_message)
                        }
                        if (ret?.code !== '0') {
                            throw new Error(ret.code)
                        }
                    }
                }
            } else if (orderDetail.platform === 'shopee') {
                cancelRet = await ShopeeInternalSvc.shopeeCancelOrder({
                    order_id,
                    cancel_reason: reason_id,
                })
                logger.info(
                    `[Cancel order SHOPEE] orderId=${order_id} ret=${JSON.stringify(
                        cancelRet
                    )}`
                )
                if (cancelRet?.error_code && cancelRet?.error_message) {
                    throw new Error(cancelRet.error_message)
                }
                if (cancelRet?.error) {
                    throw new Error(cancelRet.error)
                }
            } else if (orderDetail.platform === 'tiktok') {
                console.log('reason_id', reason_id)
                cancelRet = await TikTokInternalSvc.tikTokCancelOrder({
                    partner_id: orderDetail.partner_id,
                    platform_shop_id: orderDetail.platform_shop_id,
                    shop_order_id: orderDetail.shop_order_id,
                    cancel_reason_key: reason_id,
                })
                logger.info(
                    `[Cancel order TIKTOK] orderId=${order_id} ret=${JSON.stringify(
                        cancelRet
                    )}`
                )
                if (cancelRet?.error_code && cancelRet?.error_message) {
                    throw new Error(cancelRet.error_message)
                }
                if (cancelRet?.error) {
                    throw new Error(cancelRet.error)
                }
            } else if (
                !orderDetail.platform && orderDetail.shop_order_id
            ) {
                if (orderDetail.shipment_provider === 'GHTK') {
                    cancelRet = await GHTKInternalSvc.ghtkCancelOrder({
                        order_id: orderDetail.code,
                        tenant_id: user.tenant_id,
                    })
                    logger.info(
                        `[Cancel order GHTK] orderId=${order_id} ret=${JSON.stringify(
                            cancelRet
                        )}`
                    )
                    if (cancelRet?.message && !cancelRet?.success) {
                        throw new Error(cancelRet.message)
                    }
                }
                if (orderDetail.shipment_provider === 'GHN') {
                    cancelRet = await GHNInternalSvc.ghnCancelOrder({
                        order_codes: [orderDetail.shop_order_id],
                        tenant_id: user.tenant_id,
                    })
                    logger.info(
                        `[Cancel order GHTK] orderId=${order_id} ret=${JSON.stringify(
                            cancelRet
                        )}`
                    )
                    if (cancelRet?.code !== 200) {
                        throw new Error(cancelRet.message)
                    }
                }

                // await Order.updateOrderById(order_id, {
                //     status: ORDER_FULFILLMENT_STATUS.WAIT_TRANSPORT,
                // })
            }
            // if (
            //     fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_REJECTED &&
            //     orderDetail.fulfillment_status !==
            //         ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
            // )
            //     throw new AppError('invalid_fulfillment_status', {
            //         message: 'Hành động này cần Người bán xác nhận trước.',
            //     })

            // if (
            //     fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CANCELLED &&
            //     orderDetail.fulfillment_status !==
            //         ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED
            // )
            //     throw new AppError('invalid_fulfillment_status', {
            //         message: 'Hành động này cần Người cung cấp xác nhận trước.',
            //     })

            refundTransaction =
                await TransactionService.cancelAndRefundSellerTransaction(
                    {
                        user, // user thực hiện action này
                        for_partner_id: orderDetail.partner_id, // Hoàn tiền cho seller
                        type: TRANSACTION_TYPE.DEPOSIT,
                        amount:
                            orderDetail.payment_status ===
                                ORDER_PAYMENT_STATUS.PAID
                                ? orderDetail.total_price * 1 +
                                parseInt(orderDetail.total_shipping_fee)
                                : orderDetail.total_price * 1,
                        source: 'seller',
                        from_trans_action_type:
                            TRANSACTION_ACTION.SELLER_GET_REFUND,
                        from_note: 'Tiền hoàn do Nhà Cung Cấp hủy đơn đơn',
                        order_id,
                        order_code: orderDetail.code,
                        tenant_id: orderDetail.tenant_id,
                    },
                    trx
                )

            AuditLog.addOrderLogAsync(order_id, {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.UPDATE,
                source,
                short_description: 'Hoàn tiền do Nhà Cung cấp hủy đơn đơn',
                metadata: {
                    order_id,
                    amount:
                        orderDetail.payment_status === ORDER_PAYMENT_STATUS.PAID
                            ? orderDetail.total_price * 1 +
                            parseInt(orderDetail.total_shipping_fee)
                            : orderDetail.total_price * 1,
                    fulfillment_status,
                },
            })

            if (fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CANCELLED) {
                cancelDeptTransactionRestult =
                    await TransactionService.cancelDeptTransaction(
                        {
                            order_id: orderDetail.id,
                            for_partner_id: user.partner_id, // partner của supplier
                        },
                        trx
                    )
                if (cancelDeptTransactionRestult) {
                    AuditLog.addTransactionLogAsync(
                        cancelDeptTransactionRestult.id,
                        {
                            source,
                            user_id: user.id,
                            action: AuditLog.ACTION_TYPE.CREATE,
                            note: 'Hủy công nợ cung cấp đơn hàng',
                            metadata: {
                                amount:
                                    orderDetail.payment_status ===
                                        ORDER_PAYMENT_STATUS.PAID
                                        ? orderDetail?.total_price * 1 +
                                        parseInt(
                                            orderDetail.total_shipping_fee
                                        )
                                        : orderDetail?.total_price * 1,
                                order_id: orderDetail.id,
                                action_type: 'supplier_cancelled_order',
                            },
                        }
                    )
                }
                cancelSellerDeptTransactionRestult =
                    await TransactionService.cancelDeptTransaction(
                        {
                            order_id: orderDetail.id,
                            for_partner_id: orderDetail.partner_id, // partner của seller
                        },
                        trx
                    )
                if (cancelSellerDeptTransactionRestult) {
                    AuditLog.addTransactionLogAsync(
                        cancelSellerDeptTransactionRestult.id,
                        {
                            source: 'seller',
                            user_id: orderDetail.seller_confirmed_by,
                            action: AuditLog.ACTION_TYPE.CREATE,
                            note: 'Hủy công nợ cung cấp đơn hàng',
                            metadata: {
                                amount:
                                    orderDetail.payment_status !==
                                        ORDER_PAYMENT_STATUS.PAID
                                        ? orderDetail?.total_price * 1 +
                                        orderDetail.total_shipping_fee * 1
                                        : orderDetail.total_price * 1,
                                order_id: orderDetail.id,
                                action_type: 'supplier_cancelled_order',
                            },
                        }
                    )
                }
                for (const orderItem of orderItems) {
                    await ProductStock.incrementQtyProductStock(orderItem.product_stock_id, orderItem.qr_checked, { trx })
                    await ProductVariationStock.incrementQtyProductVariationStock(orderItem.product_variation_stock_id, orderItem.qr_checked, { trx })
                }

                const warehouseExportVariations = await WarehouseImportVariation.getManyExportWarehouseVariation({
                    order_id: orderDetail.id
                })

                // if (!warehouseExportVariations || warehouseExportVariations.length === 0) {
                //     throw new AppError('invalid_warehouse_export_variation', {
                //         message: 'Không tìm thấy phiếu xuất của đơn hàng này.',
                //     })
                // }

                for (const warehouseExportItem of warehouseExportVariations) {
                    await WarehouseImportVariation.decrementRemainingQty(warehouseExportItem.code, warehouseExportItem.total_quantity, { trx })
                }
            }

            // //<< END cancel | reject
        }
        const updateOrderData = {
            fulfillment_status,
            total_price: orderDetail.total_price,
            supplier_confirmed_by: user.id,
            note,
        }
        if (
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_REJECTED ||
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
        ) {
            updateOrderData.odii_status = ODII_ORDER_STATUS.CANCELED
        }
        updateOrderResult = await Order.updateOrderById(
            order_id,
            updateOrderData,
            { trx }
        )
        if (updateOrderResult[0] === 0)
            throw new Error('update_order_status_error')

        return {
            note,
            fulfillment_status,
            updateOrderResult,
            refundTransaction,
            cancelDeptTransactionRestult,
            supplierDeptTransaction,
        }
    })

    return trxData
}

exports.sellerSetDeliverOrder = async (
    order_id,
    { user, fulfillment_status, source }
) => {
    // get order detail
    const orderDetail = await Order.getOrderDetail(order_id, {})
    if (!orderDetail || !orderDetail?.supplier?.id)
        throw new Error('invalid_order')

    const supplierDetail = await Supplier.getSupplierById(
        orderDetail?.supplier?.id
    )

    const trxData = await useMyTrx(null, async (trx) => {
        let updateOrderResult
        let actionResult

        if (
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_DELIVERED ||
            fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_RETURNED
        ) {
            if (orderDetail.fulfillment_status !== ORDER_FULFILLMENT_STATUS.RTS)
                throw new AppError('invalid_fulfillment_status', {
                    message:
                        'Hành động này cần trạng thái đơn hàng "đang giao"',
                })

            if (
                fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_DELIVERED
            ) {
                actionResult =
                    await TransactionService.confirmedDeptTransaction(
                        {
                            order_id: orderDetail.id,
                            for_partner_id: supplierDetail.partner_id, // partner của supplier
                            tenant_id: orderDetail.tenant_id,
                        },
                        trx
                    ).then((updateResult) => {
                        console.log('updateResult = ', updateResult)
                        if (_.isEmpty(updateResult))
                            throw new AppError('confirm_seller_debt_errr', {
                                message:
                                    'Không thể xác nhận công nợ. Vui lòng liên hệ hỗ trợ',
                            })

                        return updateResult
                    })
                AuditLog.addTransactionLogAsync(actionResult.id, {
                    source,
                    user_id: user.id,
                    action: AuditLog.ACTION_TYPE.UPDATE,
                    note: 'Người bán xác nhận đơn hàng đã giao thành công',
                    metadata: {
                        order_id: orderDetail.id,
                        action_type: 'seller_set_delivered_order',
                    },
                })
            }

            if (
                fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_RETURNED
            ) {
                actionResult =
                    await TransactionService.sellerReturnedDeptTransaction(
                        {
                            order_id: orderDetail.id,
                            for_partner_id: supplierDetail.partner_id, // partner của supplier
                            tenant_id: orderDetail.tenant_id,
                        },
                        trx
                    ).then((updateResult) => {
                        console.log('updateResult = ', updateResult)
                        if (_.isEmpty(updateResult))
                            throw new AppError('seller_returned_debt_errr', {
                                message:
                                    'Không thể hoàn trả công nợ. Vui lòng liên hệ hỗ trợ',
                            })

                        return updateResult
                    })
            }
            // //<< END
        }

        updateOrderResult = await Order.updateOrderById(
            order_id,
            {
                fulfillment_status,
            },
            { trx }
        )
        if (updateOrderResult[0] === 0)
            throw new Error('update_order_status_error')

        return {
            fulfillment_status,
            updateOrderResult,
            actionResult,
        }
    })

    return trxData
}

exports.convertOrderData = async (dataFile) => {
    const buffer = await dataFile.toBuffer()

    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const sheetName = workbook.SheetNames[0]

    const sheetValue = workbook.Sheets[sheetName]

    const data = XLSX.utils.sheet_to_json(sheetValue)
    // eslint-disable-next-line no-use-before-define
    const newData = arrayToResult(data.slice(3))

    return newData
}
const arrayToResult = (arrayInfoOrder) => {
    const result = []
    let currentOrder
    // eslint-disable-next-line guard-for-in
    for (const item of arrayInfoOrder) {
        if (item.__EMPTY_1) {
            currentOrder = {
                code: getBarcode(),
                shop_order_id: item?.__EMPTY_1 || '',
                note: item?.__EMPTY_26 || '',
                payment_method: item?.__EMPTY_23 || 'COD',
                customer_email: item?.__EMPTY_18 || '',
                customer_full_name: item?.__EMPTY_16 || '',
                currency_code: 'VND',
                customer_phone: item?.__EMPTY_17 || '',
                total_retail_price: item?.__EMPTY_7 || 10000,
                shipping_address: {
                    address1: item?.__EMPTY_19 || '',
                    province_code: item?.__EMPTY_20 || '',
                    district_name: item?.__EMPTY_21 || '',
                },
                order_items: [
                    {
                        sku: item?.__EMPTY_3 || '',
                        quantity: item?.__EMPTY_8 || 1,
                        retail_price: item?.__EMPTY_9 || 100000,
                    },
                ],
            }
            result.push(currentOrder)
        } else {
            currentOrder.order_items.push({
                sku: item?.__EMPTY_3 || '',
                quantity: item?.__EMPTY_8 || 1,
                retail_price: item?.__EMPTY_9 || 100000,
            })
        }
    }

    return result
}

exports.GetTransportFeeGHTK = async (dataOrder) => {
    const response = await GHTKInternalSvc.ghtkGetTransportFee(dataOrder)

    return response
}

exports.GetTransportFeeGHN = async (dataOrder) => {
    const response = await GHNInternalSvc.ghnGetTransportFee(dataOrder)

    return response
}
exports.formatDataTransport = async (order, orderItems, pick_option, required_note) => {
    const productData = await Product.getProductStockDetail(
        orderItems[0].order_item_product_stock_id
    )

    if (order.shipment_provider === 'GHTK') {
        const resultProduct = orderItems.reduce((product, item) => {
            const newItem = {
                name: item.product_name,
                weight: (item.weight_grams / 1000) * item.order_item_quantity,
                quantity: item.order_item_quantity,
                product_code: '',
            }
            product.push(newItem)

            return product
        }, [])

        const resultOrder = {
            id: order.code,
            pick_name: productData?.supplier_warehousing?.name,
            pick_money:
                order.payment_status === 'paid'
                    ? 0
                    : order.total_retail_price * 1 +
                    order.total_insurance_fee * 1 -
                    order.total_shipping_fee * 1,
            pick_address: productData.from_location?.address1,
            pick_province: productData.from_location?.province,
            pick_district: productData.from_location?.district_name,
            pick_ward: productData.from_location?.ward_name,
            pick_tel: productData.supplier_warehousing?.phone,
            name: order.customer_full_name,
            address: order.shipping_address?.address1,
            province: order.shipping_address?.province_name,
            district: order.shipping_address?.district_name,
            ward: order.shipping_address?.ward_name,
            tel: order.customer_phone,
            note: order.note,
            email: order.customer_email,
            value: order.total_retail_price * 1 - order.total_shipping_fee * 1,
            is_freeship: order.payment_status === 'paid' ? 1 : 0,
            pick_option,
        }

        return {
            products: resultProduct,
            order: resultOrder,
        }
    }
    if (order.shipment_provider === 'GHN') {
        let total_weight = 0
        const resultProduct = orderItems.reduce((product, item) => {
            const newItem = {
                name: item.product_name,
                weight: item.weight_grams * item.order_item_quantity,
                quantity: item.order_item_quantity,
            }
            product.push(newItem)
            total_weight += newItem.weight
            return product
        }, [])

        const resultOrder = {
            client_order_code: order.code,
            payment_type_id: order.payment_status === 'paid' ? 1 : 2,
            note: order.note,
            from_name: productData?.supplier_warehousing?.name,
            from_phone: productData.supplier_warehousing?.phone,
            from_address: productData.from_location?.address1,
            from_ward_name: productData.from_location?.ward_name,
            from_district_name: productData.from_location?.district_name,
            from_province_name: productData.from_location?.province,
            required_note: required_note,
            weight: total_weight,
            to_name: order.customer_full_name,
            to_phone: order.customer_phone,
            to_address: order.shipping_address?.address1,
            to_ward_name: order.shipping_address?.ward_name,
            to_district_name: order.shipping_address?.district_name,
            to_province_name: order.shipping_address?.province_name,
            service_id: order.shipping_address?.service_id,
            cod_amount:
                order.payment_status === 'paid'
                    ? 0
                    : order.total_retail_price * 1 +
                    order.total_insurance_fee * 1 -
                    order.total_shipping_fee * 1,
            insurance_value: order.total_retail_price * 1 - order.total_shipping_fee * 1,
        }

        return {
            ...resultOrder,
            items: resultProduct,
        }
    }
    return {
        is_success: false
    }
}
// exports.test12 = async () => {
//     console.log(' run test12')
//     await useMyTrx(null, async (trx) => {
//         // 2. Hủy công nợ của supplier: order_id
//         console.log('111111')
//         const result = await TransactionService.cancelDeptTransaction(
//             {
//                 order_id: 10000,
//                 for_partner_id: '22222',
//             },
//             trx
//         )
//         console.log('2222222=', result)
//     })
// }

// setTimeout(exports.test12, 2000)
