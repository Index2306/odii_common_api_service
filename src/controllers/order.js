const Joi = require('joi')
const _ = require('lodash')
const { knex } = require('../connections/pg-general')
const axios = require('axios')
const moment = require('moment-timezone')
const BlueBird = require('bluebird')
const Order = require('../models/order')
const User = require('../models/user')
const Location = require('../models/location')
const Transaction = require('../models/transaction')
const AuditLog = require('../models/audit-log')
const Tenant = require('../models/tenant')
const Balance = require('../models/balance')
const OrderService = require('../services/order')
const WarehouseImportVariation = require('../models/supplierWarehouse')
const AffiliatePayoutService = require('../services/affiliate_payout.service')
const Supplier = require('../models/supplier')
const Customer = require('../models/customer')
const LazadaInternalSvc = require('../services/lazada.service')
const ShopeeInternalSvc = require('../services/shopee.service')
const { parseOption } = require('../utils/pagination')
const { getTransactionBankCode } = require('../utils/common.util')
const TikTokInternalSvc = require('../services/tiktok.service')
const GHTKInternalSvc = require('../services/ghtk.service')
const GHNInternalSvc = require('../services/ghn.service')
const ProductStock = require('../models/product-stock')
const ProductVariationStock = require('../models/product-variation-stock')

const {
    ORDER_STATUS,
    ORDER_PAYMENT_STATUS,
    ORDER_FULFILLMENT_STATUS,
    CANCEL_STATUS,
    ODII_ORDER_STATUS,
} = require('../constants/oms-status')
const { ACC_TYPE, ROLES } = require('../constants')
// const {
//     KAFKA_TOPIC_ODII_ORDER_UPDATE,
//     kafkaProduceEvent,
// } = require('../connections/kafka-general')
const {
    KAFKA_TOPIC_ODII_ORDER_UPDATE,
    rabbitMQProduceEvent,
} = require('../connections/rabbitmq-general')

const NotificationService = require('../services/notification')
const AppError = require('../utils/app-error')
const { default: logger } = require('../logger')
const { getPromotionProductAndOrder } = require('../models/promotion')

exports.createPersonalOrder = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            note: Joi.string(),
            store_id: Joi.string(),
            store_source: Joi.string(),
            payment_status: Joi.string()
                .allow(ORDER_PAYMENT_STATUS.PENDING, ORDER_PAYMENT_STATUS.PAID)
                .only(),
            payment_method: Joi.string()
                .allow('COD', 'BANK_TRANSFER', 'DEBT')
                .only(),
            // supplier_warehousing_id: Joi.number().required(),
            customer_id: Joi.string().optional(),
            customer_phone: Joi.string().required(),
            customer_email: Joi.string().email().optional(),
            customer_full_name: Joi.string().required(),
            total_retail_price: Joi.number(),
            total_shipping_fee: Joi.number(),
            total_insurance_fee: Joi.number(),
            shipment_provider: Joi.string().required(),
            shipping_address: Joi.object()
                .keys({
                    country_id: Joi.string().default('240'),
                    country_name: Joi.string().default('Vietnam'),
                    province_name: Joi.string().required(),
                    province_id: Joi.string().required(),
                    district_name: Joi.string().required(),
                    district_id: Joi.string().required(),
                    ward_name: Joi.string().required(),
                    ward_id: Joi.string().required(),
                    address1: Joi.string().required(),
                    address2: Joi.string().optional(),
                    zip: Joi.string().optional(),
                    service_id: Joi.number().optional(),
                })
                .required(),
            order_items: Joi.array()
                .items(
                    Joi.object().keys({
                        product_variation_stock_id: Joi.number().required(),
                        quantity: Joi.number().required(),
                        retail_price: Joi.number(),
                    })
                )
                .min(1)
                .required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.source = request.odii_source
    value.tenant_id = user.tenant_id

    const dataCheck = await Order.getOrders({
        is_deleted: false,
        is_map: true,
        tenant_id: user.tenant_id,
    })

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    if (dataCheck.length >= subscript.rule.maxOrder) {
        throw new Error('Số đơn hàng đã đạt mức tối đa cho phép của gói. Xin vui lòng liên hệ admin để được hỗ trợ')
    }


    const customer = await Customer.getOneById(value.customer_id)
    if (!customer) throw new Error('invalid_customer')

    const fromBalance = await Balance.getPrimaryBalanceByPartner(
        user.partner_id
    )

    const tenant = await Tenant.getDomainByTenantId(user.tenant_id)

    if (fromBalance.amount - value.total_retail_price < tenant.min_limit_amount) {
        return {
            is_success: false,
            balance: fromBalance.amount - tenant.min_limit_amount,
            message: 'Số dư khả dụng còn lại không đử để thanh toán'
        }
    }

    const data = await OrderService.createPersonalOrder(user, value)

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetTransportFee = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            province: Joi.string().required(),
            district: Joi.string().required(),
            ward: Joi.string().required(),
            address: Joi.string(),
            weight: Joi.number().integer().required(),
            value: Joi.number().integer(),
            deliver_option: Joi.string(),
            tags: Joi.array().allow(null).optional(),
            location_id: Joi.number().required(),
        })
        .validateAsync(request.body, {
            stripUnknown: false,
            allowUnknown: true,
        })
    const location = await Location.getLocationById(value.location_id)
    if (location) {
        delete value.location_id
        value.pick_province = location.province
        value.pick_district = location.district_name
        value.pick_ward = location.ward_name
        value.tenant_id = user.tenant_id
    }
    const platforms = await Tenant.getAllTenantTransportPlatform({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    const only_platform = platforms.map(item => item.platform)
    let data = {}
    if (only_platform.includes('GHTK')) {
        const dataGHTK = await OrderService.GetTransportFeeGHTK(value)
        data = {
            ...data,
            data_ghtk: dataGHTK
        }
    }
    if (only_platform.includes('GHN')) {
        const dataGHN = await OrderService.GetTransportFeeGHN(value)
        data = {
            ...data,
            data_ghn: dataGHN
        }
    }

    return {
        is_success: true,
        data
    }
}

exports.adminGetOrders = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            customer_keywords: Joi.string().min(2),
            id: Joi.string().optional(),
            code: Joi.string().optional(),
            store_id: Joi.string(),

            status: Joi.string().min(2).max(20),
            fulfillment_status: Joi.string().min(2).max(20),
            payment_status: Joi.string().min(2).max(20),

            from_time: Joi.date().iso().optional(),
            to_time: Joi.date().iso().optional(),

            partner_id: Joi.string(),
            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const data = await Order.getOrderListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetOrders = async (request) => {
    const { user } = request
    // const isNotOdii = request.query.isNotOdii === 'true'
    const option = parseOption(request.query)
    // option.isNotOdii = isNotOdii

    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            customer_keywords: Joi.string().min(2),
            id: Joi.string().optional(),
            code: Joi.string().optional(),
            store_id: Joi.string(),

            status: Joi.string(),
            odii_status: Joi.string(),
            platform: Joi.string(),
            payment_status: Joi.string(),

            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),

            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
            fulfillment_status: Joi.string(),
        })
        .validateAsync(_.omit(request.query, ['page', 'page_size']), {
            stripUnknown: false,
        })

    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    query.from_time = moment(from_date, 'YYYY-MM-DD')
        .tz(timezone)
        .startOf('day')
        .utc()
        .toISOString()
    console.log('from_time = ', query.from_time)

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    console.log('to_time = ', query.to_time)

    const dataCheck = await Order.getOrders({
        is_deleted: false,
        is_map: true,
        tenant_id: user.tenant_id,
    })

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    if (dataCheck.length > subscript.rule.maxOrder) {
        throw new Error('Số đơn hàng đã đạt mức tối đa cho phép của gói. Xin vui lòng liên hệ admin để được hỗ trợ')
    }

    const data = await Order.getOrderListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierGetOrders = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    // option.is_supplier = true
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }

    option.user = user
    option.tenant_id = user.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            // customer_keywords: Joi.string().min(2),
            // id: Joi.string().optional(),
            // code: Joi.string().optional(),
            // status: Joi.string().min(2).max(20),
            fulfillment_status: Joi.string(),
            // payment_status: Joi.string().min(2).max(20),
            from_time: Joi.date().iso().optional(),
            to_time: Joi.date().iso().optional(),
            // supplier_id: Joi.string(),
            // supplier_warehousing_id: Joi.string(),
            print_status: Joi.string().allow('printed', 'unprinted').only(),
            odii_status: Joi.number(),
            platform: Joi.string()
                .allow('lazada', 'shopee', 'tiktok', 'other')
                .only(),
        })
        .validateAsync(_.omit(request.query, ['page', 'page_size']), {
            stripUnknown: false,
        })

    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    query.supplier_id = supplierData.id
    // option.fulfillment_status = [
    //     ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
    //     ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
    //     ORDER_FULFILLMENT_STATUS.SUP_REJECTED,
    //     ORDER_FULFILLMENT_STATUS.FULFILLED,
    //     ORDER_FULFILLMENT_STATUS.PARTIAL,
    //     ORDER_FULFILLMENT_STATUS.RESTOCKED,
    //     ORDER_FULFILLMENT_STATUS.RTS,
    //     ORDER_FULFILLMENT_STATUS.SUP_PACKED,
    //     ORDER_FULFILLMENT_STATUS.SUP_CANCELLED,
    //     ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED,
    // ]

    // option.not_fulfillment_status = ORDER_FULFILLMENT_STATUS.PENDING
    if (query.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED) {
        delete query.fulfillment_status
        option.fulfillment_status = [
            ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
            ORDER_FULFILLMENT_STATUS.SUP_PACKED,
            ORDER_FULFILLMENT_STATUS.RTS,
        ]
    }
    const data = await Order.getOrderListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.supplierCountOrderStatus = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    option.user = user
    const supplierData = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplierData) throw new Error('supplier_not_found')
    const query = {}
    query.supplier_id = supplierData.id

    const data = await Order.getOrderListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetOrder = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })

    const data = await Order.getOrderDetail(id, {})

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetOrder = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })

    const option = { partner_id: user.partner_id }
    const data = await Order.getOrderDetail(id, option)
    if (Array.isArray(data.order_items) && !data.order_items[0]) {
        data.order_items = []
    }

    return {
        is_success: true,
        data,
    }
}

exports.supplierGetOrder = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync(request.params, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const option = {
        // partner_id: user.partner_id,
        supplier_id: supplierOfUser.id,
    }
    if (user.roles?.includes(ROLES.PARTNER_SOURCE)) {
        option.product_source_ids = user.sources?.map((item) => item.id)
    }
    console.log('supplierGetOrder option = ', option)
    const data = await Order.getOrderDetail(id, option)

    return {
        is_success: true,
        data,
    }
}

exports.adminUpdateOrder = async (request) => {
    const { user } = request
    const { id, note, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            status: Joi.string()
                .valid(...Object.values(ORDER_STATUS))
                .allow(null),
            payment_status: Joi.string()
                .valid(...Object.values(ORDER_PAYMENT_STATUS))
                .allow(null)
                .optional(),
            fulfillment_status: Joi.string()
                .valid(...Object.values(ORDER_FULFILLMENT_STATUS))
                .allow(null)
                .optional(),
            note: Joi.string().min(10).required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const order = await Order.getOrderById(id)

    if (!order) throw new Error('order_not_found')

    const updateResult = await Order.updateOrderById(id, values)
    const users = await User.getUserPartner(order.partner_id)
    const userIds = users.filter((i) => !!i.id).map((i) => i.id)
    const is_success = updateResult[0] !== 0

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        note,
        metadata: values,
        current_data: order,
        change_to_data: values,
    })
    if (
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.FULFILLED ||
        values.fulfillment_status ===
        ORDER_FULFILLMENT_STATUS.PLATFORM_CANCELLED
    ) {
        NotificationService.sendMessage(user.id, {
            type: 'order',
            status: values.fulfillment_status,
            partner_id: order.partner_id,
            arrReceiver: userIds,
            source: 'seller',
            metadata: {
                status: values.fulfillment_status,
            },
            content: `Bạn có đơn hàng #${id} vừa được ${values.fulfillment_status} `,
            data_id: id,
        })
    }

    return {
        is_success,
        data: { id },
    }
}

exports.sellerUpdateStatus = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
            reason_id: Joi.string(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
                    ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED,
                    ORDER_FULFILLMENT_STATUS.SELLER_IGNORED
                )
                .allow(null)
                .optional(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    values.user = user
    values.source = request.odii_source

    if (values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED)
        values.cancel_status = CANCEL_STATUS.SELLER_CANCELLED

    const updateResult = await OrderService.sellerConfirmOrder(id, values)
    // console.log('updateResult = ', updateResult)
    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        note: values.note,
        short_description: 'Người bán thay đổi trạng thái đơn',
        metadata: {
            fulfillment_status: values.fulfillment_status,
        },
    })

    return {
        is_success: true,
        data: updateResult,
    }
}

exports.sellerUpdateMultiOrderStatus = async (request) => {
    const { user } = request
    const { ids, ...values } = await Joi.object()
        .keys({
            ids: Joi.array().items(Joi.number()).required(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED,
                    ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED
                )
                .optional(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const orders = await Order.getOrderByIds(ids, {})
    if (!orders || orders.length !== ids.length)
        throw new Error('order_not_found')

    const results = []
    values.user = user
    values.source = request.odii_source
    if (values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED)
        values.cancel_status = CANCEL_STATUS.SELLER_CANCELLED
    if (
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CONFIRMED
    ) {
        ids.forEach(async (id) => {
            const updateResult = await OrderService.sellerConfirmOrder(
                id,
                values
            )
            AuditLog.addOrderLogAsync(id, {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.UPDATE,
                source: request.odii_source,
                note: values.note,
                short_description: 'Người bán thay đổi trạng thái đơn',
                metadata: {
                    fulfillment_status: values.fulfillment_status,
                },
            })
            results.push(updateResult)
        })

        return {
            is_success: true,
            data: results,
        }
    }

    return {
        is_success: false,
        data: 'action not allow',
    }
}

exports.supplierUpdatePersonalOrderStatus = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.FULFILLED,
                    ORDER_FULFILLMENT_STATUS.FAILED
                )
                .allow(null)
                .optional(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    values.user = user
    values.source = request.odii_source
    if (values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SELLER_CANCELLED)
        values.cancel_status = CANCEL_STATUS.SELLER_CANCELLED

    const updateResult = await OrderService.sellerConfirmOrder(id, values)
    // console.log('updateResult = ', updateResult)
    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        note: values.note,
        short_description: 'Người bán thay đổi trạng thái đơn',
        metadata: {
            fulfillment_status: values.fulfillment_status,
        },
    })

    return {
        is_success: true,
        data: updateResult,
    }
}

exports.supplierSetInvoiceNumber = async (request) => {
    const { user } = request
    const { id, invoice_number } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            invoice_number: Joi.string().min(2).required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    console.log(orderItems)

    if (orderItems[0].platform !== 'lazada')
        throw new Error('platform must be lazada')

    const callLzdResultAll = await BlueBird.map(orderItems, (item) =>
        LazadaInternalSvc.lzdSetInvoiceNumber({
            partner_id: item.partner_id,
            platform_shop_id: item.platform_shop_id,
            order_item_id: item.shop_order_item_id,
            invoice_number,
        })
    )
    console.log('callLzdResult = ', callLzdResultAll)
    if (!callLzdResultAll || !callLzdResultAll[0])
        throw new Error('request_lzd_fail')

    await Order.updateOrderById(id, { invoice_number })

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        short_description: 'Cập nhật số hóa đơn',
        metadata: {
            invoice_number,
        },
    })

    return {
        is_success: true,
        // data: updateResult,
    }
}

exports.supplierSetPack = async (request) => {
    const { user } = request
    const { id, shipping_provider, package_id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            shipping_provider: Joi.string().min(2).default('LEX VN'),
            package_id: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    console.log(orderItems)
    if (
        orderItems[0]?.fulfillment_status ===
        ORDER_FULFILLMENT_STATUS.SUP_PACKED ||
        orderItems[0]?.fulfillment_status === ORDER_FULFILLMENT_STATUS.RTS
    )
        throw new AppError('order_packed', {
            message: 'Đơn hàng đã được đóng hoặc đã sẵn sàng vận chuyển',
        })

    const checkExistWarehouseWxport = await WarehouseImportVariation.getWarehouseExportDetail({
        order_id: id
    })

    if (!checkExistWarehouseWxport)
        throw new Error('Không tìm thấy phiếu xuất của đơn hàng này')

    // console.log('shipping_provider = ', shipping_provider) fulfillment_status
    console.log('id = ', id)
    let resData

    if (!orderItems[0]?.platform) {
        // personal order
        const packageId = package_id ?? getTransactionBankCode(id)
        await Order.updateOrderById(id, {
            shop_status: ORDER_FULFILLMENT_STATUS.SUP_PACKED,
            package_id: packageId,
        })
        resData = { package_id: packageId }
    } else if (orderItems[0].platform === 'lazada') {
        const callLzdResultAll = await LazadaInternalSvc.lzdSetPack({
            partner_id: orderItems[0].partner_id,
            platform_shop_id: orderItems[0].platform_shop_id,
            shipping_provider: 'LEX VN',
            delivery_type: 'dropship',
            order_item_ids: JSON.stringify(
                orderItems.map((data) => data.shop_order_item_id)
            ),
        })

        console.log('callLzdResult = ', callLzdResultAll)
        if (!callLzdResultAll) throw new Error('request_lzd_fail')
        const lazadaOrderItemData = callLzdResultAll?.data?.order_items[0]

        // update shipping provider
        await Order.updateOrderById(id, {
            fulfillment_status: ORDER_FULFILLMENT_STATUS.SUP_PACKED,
            tracking_id: lazadaOrderItemData.tracking_number,
            package_id: lazadaOrderItemData.package_id,
            shipment_provider: lazadaOrderItemData.shipment_provider,
            status: 'packed',
        })

        await WarehouseImportVariation.updateSupplierExportWarehouse(
            {
                order_id: id
            },
            {
                time_export: new Date(),
                user_export_id: user.id
            }
        )

        // const callLzdResultRTS = await LazadaInternalSvc.lzdSetRTS({
        //     partner_id: orderItems[0].partner_id,
        //     platform_shop_id: orderItems[0].platform_shop_id,
        //     shipment_provider: lazadaOrderItemData.shipment_provider,
        //     tracking_number: lazadaOrderItemData.tracking_number,
        //     delivery_type: 'dropship',
        //     order_item_ids: JSON.stringify(
        //         orderItems.map((data) => data.shop_order_item_id)
        //     ),
        // })

        // const updateResultRTS = await Order.updateOrderById(id, {
        //     fulfillment_status: ORDER_FULFILLMENT_STATUS.RTS,
        // })
        AuditLog.addOrderLogAsync(id, {
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.UPDATE,
            source: request.odii_source,
            short_description: 'Đã đóng gói',
            metadata: callLzdResultAll?.data || callLzdResultAll,
        })
        resData = {
            callLzdSetPacked: callLzdResultAll?.data,
        }
    } else {
        throw new AppError('not_support', {
            message: 'Chức năng chưa hỗ trợ cho đơn hàng này',
        })
    }

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        short_description: 'Xác nhận đã đóng hàng',
        metadata: resData,
    })

    return {
        is_success: true,
        data: resData,
    }
}

exports.supplierSetTrackingInfo = async (request) => {
    const { user } = request
    const { id, tracking_id, invoice_number, is_rts } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            tracking_id: Joi.string(),
            invoice_number: Joi.string(),
            is_rts: Joi.boolean(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')

    console.log('invoice_number = ', invoice_number)
    console.log('tracking_id = ', tracking_id)
    console.log('id = ', id)

    if (!orderItems[0]?.platform) {
        const updateBody = {
            tracking_id,
            invoice_number,
        }
        if (is_rts === true) {
            updateBody.fulfillment_status = ORDER_FULFILLMENT_STATUS.RTS
        }
        await Order.updateOrderById(id, updateBody)
    } else {
        throw new AppError('not_support', {
            message: 'Chức năng chỉ hỗ trợ cho đơn hàng tự tạo',
        })
    }

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        short_description: 'Cập nhật thông tin tra cứu',
        metadata: {
            invoice_number,
            tracking_id,
        },
    })

    return {
        is_success: true,
        data: {
            id,
            invoice_number,
            tracking_id,
        },
    }
}

exports.supplierGetShippingLabel = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    console.log('supplierOfUser = ', supplierOfUser)
    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    console.log('orderItems = ', orderItems)
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')

    if (orderItems[0]?.platform !== 'lazada')
        throw new Error('platform must be lazada')

    const callLzdResultAll = await LazadaInternalSvc.lzdGetDocument({
        partner_id: orderItems[0].partner_id,
        platform_shop_id: orderItems[0].platform_shop_id,
        doc_type: 'shippingLabel',
        order_item_ids: JSON.stringify(
            orderItems.map((data) => data.shop_order_item_id)
        ),
    })
    // console.log('callLzdResult = ', callLzdResultAll)
    if (!callLzdResultAll) throw new Error('request_lzd_fail')
    // const tmp = callLzdResultAll?.data?.order_items[0]

    if (callLzdResultAll)
        await Order.updateOrderById(id, { print_updated_at: new Date() })

    return {
        is_success: true,
        data: callLzdResultAll?.data?.document,
    }
}

exports.supplierGetShippingProvider = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const orderItems = await Order.getOrderItems(id)
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    console.log(orderItems)

    console.log('id = ', id)

    if (orderItems[0].platform !== 'lazada')
        throw new Error('platform must be lazada')

    const callLzdResultAll = await LazadaInternalSvc.lzdGetShipmentProviders({
        partner_id: orderItems[0].partner_id,
        platform_shop_id: orderItems[0].platform_shop_id,
    })
    console.log('callLzdResult = ', callLzdResultAll)
    if (!callLzdResultAll) throw new Error('request_lzd_fail')
    // const tmp = callLzdResultAll?.data?.order_items[0]

    return {
        is_success: true,
        data: callLzdResultAll?.shipment_providers,
    }
}

const validateResponseShopee = (response) => {
    if (response?.error_code || response?.error_message)
        throw new Error(response.error_code, response.error_message)
}

exports.supplierGetShippingParameter = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')

    if (orderItems[0].platform !== 'shopee')
        throw new Error('platform must be shopee')

    const response = await ShopeeInternalSvc.getShippingParameter({
        partner_id: orderItems[0].partner_id,
        order_id: id,
    })
    validateResponseShopee(response)

    return {
        is_success: true,
        data: response,
    }
}

exports.supplierShipOrderAndCreateDocument = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const { dropoff, pickup } = await Joi.object()
        .keys({
            dropoff: Joi.object().optional(),
            pickup: Joi.object().optional(),
        })
        .validateAsync(request.body, {
            stripUnknown: false,
            allowUnknown: true,
        })
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0].platform !== 'shopee')
        throw new Error('platform must be shopee')

    const response = await ShopeeInternalSvc.shipOrderAndCreateDocument({
        partner_id: orderItems[0].partner_id,
        order_id: id,
        ...(dropoff && { dropoff }),
        ...(pickup && { pickup }),
    })
    validateResponseShopee(response)
    // Update order status

    const checkExistWarehouseWxport = await WarehouseImportVariation.getWarehouseExportDetail({
        order_id: id
    })

    if (!checkExistWarehouseWxport)
        throw new Error('Không tìm thấy phiếu xuất của đơn hàng này')

    await Order.updateOrderById(id, {
        fulfillment_status: ORDER_FULFILLMENT_STATUS.RTS,
        status: 'ready_to_ship',
        odii_status: ODII_ORDER_STATUS.WAIT_SHIPPING,
    })

    await WarehouseImportVariation.updateSupplierExportWarehouse(
        {
            order_id: id
        },
        {
            time_export: new Date(),
            user_export_id: user.id
        }
    )

    return {
        is_success: true,
        data: response,
    }
}

exports.supplierDownloadShippingDocument = async (request, reply) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0].platform !== 'shopee')
        throw new Error('platform must be shopee')

    const response = await ShopeeInternalSvc.downloadShippingDocument({
        partner_id: orderItems[0].partner_id,
        order_id: id,
    })

    if (response)
        await Order.updateOrderById(id, { print_updated_at: new Date() })

    let responseValid
    try {
        responseValid = JSON.parse(response.toString())
    } catch {
        responseValid = {}
    }

    if (responseValid.error_code || responseValid.error_message) {
        throw new AppError(responseValid.error_code, {
            message: responseValid.error_message,
        })
    }

    return reply.code(200).send(response)
}

exports.supplierSetRTS = async (request) => {
    const { user } = request
    const { id, pick_up_type } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            pick_up_type: Joi.number(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0]?.fulfillment_status == ORDER_FULFILLMENT_STATUS.RTS)
        throw new AppError('order_ready_to_ship', {
            message: 'Đơn hàng đã sẵn sàng vận chuyển',
        })

    if (
        ![
            ORDER_FULFILLMENT_STATUS.SUP_PACKED,
            ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
        ].includes(orderItems[0]?.fulfillment_status)
    )
        throw new AppError('cant_set_rts', {
            message: 'Đơn hàng cần được xác nhận hoặc đã đóng gói',
        })

    const checkExistWarehouseWxport = await WarehouseImportVariation.getWarehouseExportDetail({
        order_id: id
    })

    if (!checkExistWarehouseWxport)
        throw new Error('Không tìm thấy phiếu xuất của đơn hàng này')

    let forCheckData
    const orderTmp = await Order.getOrderById(id)
    if (orderItems[0].platform === 'lazada') {
        forCheckData = await LazadaInternalSvc.lzdSetRTS({
            partner_id: orderItems[0].partner_id,
            platform_shop_id: orderItems[0].platform_shop_id,
            shipment_provider: orderItems[0].shipment_provider,
            tracking_number: orderTmp.tracking_id,
            delivery_type: 'dropship',
            order_item_ids: JSON.stringify(
                orderItems.map((data) => data.shop_order_item_id)
            ),
        })
        // console.log('callLzdResult = ', forCheckData)
        if (!forCheckData) throw new Error('request_lzd_fail')
    } else if (orderItems[0].platform === 'tiktok') {
        forCheckData = await TikTokInternalSvc.tiktokSetRTS({
            partner_id: orderItems[0].partner_id,
            platform_shop_id: orderItems[0].platform_shop_id,
            shipping_provider_id: orderTmp.shipment_provider_id,
            tracking_number: orderTmp.tracking_id,
            pick_up_type,
            package_id: orderTmp.package_id,
            shop_order_id: orderTmp.shop_order_id,
        })
        console.log('forCheckData', forCheckData)
        if (!forCheckData) throw new Error('request_tiktok_fail')
    } else if (
        !orderItems[0].platform ||
        orderItems[0].platform === 'personal'
    ) {
        console.log('xử lý đơn hàng tự tạo')
        forCheckData = { message: 'Đang xử lý đơn' }
    } else {
        throw new Error('invalid platform')
    }

    await Order.updateOrderById(id, {
        fulfillment_status: ORDER_FULFILLMENT_STATUS.RTS,
        status: 'ready_to_ship',
        odii_status: ODII_ORDER_STATUS.WAIT_SHIPPING,
    })

    await WarehouseImportVariation.updateSupplierExportWarehouse(
        {
            order_id: id
        },
        {
            time_export: new Date(),
            user_export_id: user.id
        }
    )

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        short_description: 'Đã sẵn sàng để vận chuyển',
        metadata: forCheckData?.data || forCheckData,
    })

    return {
        is_success: true,
        data: { forCheckData },
    }
}
exports.supplierUpdateMultiOrderStatus = async (request) => {
    const { user } = request
    const { ids, ...values } = await Joi.object()
        .keys({
            ids: Joi.array().items(Joi.number()).required(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
                    ORDER_FULFILLMENT_STATUS.SUP_REJECTED,
                    ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
                )
                .optional(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')
    const orders = await Order.getOrderByIds(ids, {
        supplier_id: supplierOfUser.id,
    })
    if (!orders || orders.length !== ids.length) {
        throw new AppError('order_not_found', {
            message:
                'Đơn hàng không tồn tại. Nếu có thắc mắc vui lòng liên hệ hỗ trợ',
        })
    }
    values.user = user
    values.source = request.odii_source
    const updateResult = ids.map((orderId) =>
        OrderService.supplierConfirmOrder(orderId, values)
    )
    await Promise.all(updateResult)
    // const updateResult = await OrderService.supplierConfirmOrder(id, values)
    ids.forEach((id) => {
        AuditLog.addOrderLogAsync(id, {
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.UPDATE,
            source: request.odii_source,
            note: values.note,
            short_description: 'Nhà CC thay đổi trạng thái đơn',
            metadata: {
                fulfillment_status: values.fulfillment_status,
            },
        })
    })
    const userIds = [updateResult.partner_id]
    if (
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED ||
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_REJECTED
    ) {
        NotificationService.sendMessage(user.id, {
            type: 'order',
            status: values.fulfillment_status,
            partner_id: updateResult.partner_id,
            arrReceiver: userIds,
            source: 'supplier',
            metadata: {
                status: values.fulfillment_status,
            },
            content: `Bạn có ${ids.length} đơn hàng vừa được ${values.fulfillment_status} `,
            data_id: ids.map((item) => `${item}`).join(', '),
        })
    }

    return {
        is_success: true,
        data: updateResult,
    }
}

exports.supplierUpdateStatus = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
            reason_id: Joi.string(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
                    ORDER_FULFILLMENT_STATUS.SUP_REJECTED,
                    ORDER_FULFILLMENT_STATUS.SUP_CANCELLED
                )
                .optional(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')
    const order = await Order.getOrder({ id, supplier_id: supplierOfUser.id })

    if (!order)
        throw new AppError('order_not_found', {
            message:
                'Đơn hàng không tồn tại. Nếu có thắc mắc vui lòng liên hệ hỗ trợ',
        })

    const checkExistWarehouseWxport = await WarehouseImportVariation.getWarehouseExportDetail({
        order_id: order.id
    })

    if (checkExistWarehouseWxport && values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED)
        throw new Error('Đơn hàng đã có phiếu xuất')

    values.user = user
    values.source = request.odii_source
    values.supplier_id = supplierOfUser.id

    const updateResult = await OrderService.supplierConfirmOrder(id, values)
    console.log('updateResult = ', updateResult)

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        note: values.note,
        short_description: 'Nhà CC thay đổi trạng thái đơn',
        metadata: {
            fulfillment_status: values.fulfillment_status,
        },
    })
    const userIds = [updateResult.partner_id]
    if (
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED ||
        values.fulfillment_status === ORDER_FULFILLMENT_STATUS.SUP_REJECTED
    ) {
        NotificationService.sendMessage(user.id, {
            type: 'order',
            status: values.fulfillment_status,
            partner_id: updateResult.partner_id,
            arrReceiver: userIds,
            source: 'supplier',
            metadata: {
                status: values.fulfillment_status,
            },
            content: `Bạn có đơn hàng #${id.code} vừa được ${values.fulfillment_status} `,
            data_id: id,
        })
    }

    return {
        is_success: true,
        data: updateResult,
    }
}

// delivered
exports.sellerUpdateDeliveredStatus = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            fulfillment_status: Joi.string()
                .valid(
                    ORDER_FULFILLMENT_STATUS.SELLER_DELIVERED,
                    ORDER_FULFILLMENT_STATUS.SELLER_RETURNED
                )
                .required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const order = await Order.getOrder({ id, partner_id: user.partner_id })

    if (!order) throw new Error('order_not_found')

    values.user = user
    values.source = request.odii_source
    await AffiliatePayoutService.insertAffiliatePayout(id)
    const updateResult = await OrderService.sellerSetDeliverOrder(id, values)

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        note: values.note,
        short_description: 'Người bán thay đổi trạng thái đơn hàng',
        metadata: {
            fulfillment_status: values.fulfillment_status,
        },
    })

    return {
        is_success: true,
        data: updateResult,
    }
}

exports.sellerCommentOrder = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const order = await Order.getOrderById(id)

    if (!order) throw new Error('order_not_found')

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.COMMENT,
        source: request.odii_source,
        note: values.note,
        short_description: 'Người bán tạo ghi chú',
    })

    return {
        is_success: true,
    }
}

exports.accountantCommentTransaction = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const transaction = await Transaction.getTransactionById(id)

    if (!transaction) throw new Error('order_not_found')

    AuditLog.addTransactionLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.COMMENT,
        source: request.odii_source,
        note: values.note,
        short_description: 'Kế toán tạo ghi chú',
    })

    return {
        is_success: true,
    }
}
exports.producerKafkaMessage = async () => {
    const message = new Date().toISOString()
    console.log('message = ', message)

    await rabbitMQProduceEvent(
        KAFKA_TOPIC_ODII_ORDER_UPDATE,
        { message, time: new Date().getTime() },
        new Date().getTime()
    )

    return {
        is_success: true,
    }
}

exports.sellerGetOrderTimeLine = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { type: 'order' }

    const data = await AuditLog.getAuditLogByIdAndType(id, options)

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetOrderConfirmInfo = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await OrderService.getOrderConfirmInfo(id, {
        user: request.user,
    })

    return {
        is_success: true,
        data,
    }
}
exports.sellerImportOrderByExcel = async (request) => {
    const { user } = request
    const dataFile = await request.file()

    const value = await OrderService.convertOrderData(dataFile)

    value.source = request.odii_source

    const import_success = []
    const import_failed = []

    await BlueBird.map(value, async (item) => {
        try {
            item.type = 'excel'
            const data = await OrderService.createPersonalOrder(user, item)
            import_success.push({
                code: data.code,
                customer_name: data.customer_full_name,
                order_items: data.order_items.map((item) => ({
                    product_name: item.product_name,
                    product_variation_name: item.product_variation_name,
                    product_code: item.code,
                    quantity: item.quantity,
                })),
            })
        } catch (error) {
            import_failed.push({
                item,
                error: error.errorMessage,
            })
        }
    })

    return {
        is_success: true,
        data: {
            import_success,
            import_failed,
        },
    }
}

exports.getRejectReasonList = async (request) => {
    // const { user } = request
    const { id, reverse_action_type } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            reverse_action_type: Joi.number().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const orderDetail = await Order.getOrder({ id })
    if (!orderDetail) throw new Error('Cannot find order')

    if (orderDetail.platform === 'tiktok') {
        const result = await TikTokInternalSvc.tikTokGetRejectReasons({
            partner_id: orderDetail.partner_id,
            platform_shop_id: orderDetail.platform_shop_id,
            order_status: `${orderDetail.status}`,
            reverse_action_type,
        })

        return {
            is_success: true,
            data: result,
        }
    }
    if (orderDetail.platform === 'lazada') {
        const result = await LazadaInternalSvc.lzdGetRejectReasons({
            partner_id: orderDetail.partner_id,
            platform_shop_id: orderDetail.platform_shop_id,
        })

        return {
            is_success: true,
            data: result,
        }
    }
    if (orderDetail.platform === 'shopee') {
    }

    return {
        is_success: true,
        data: [],
    }
}

exports.supplierPrintTiktokOrder = async (request) => {
    const { user } = request
    const { id, document_type } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            document_type: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0].platform !== 'tiktok')
        throw new Error('platform must be Tiktok')

    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    const response = await TikTokInternalSvc.tiktokPrintOrder({
        partner_id: orderItems[0].partner_id,
        platform_shop_id: order.platform_shop_id,
        package_id: order.package_id,
        document_type, //  BEL = 1- PICK_LIST = 2- SL+PL = 3PACK_LIST is not available in this version.
        document_size: 0, // A6 = 0- A5 = 1
    })
    if (response)
        await Order.updateOrderById(id, { print_updated_at: new Date() })

    return {
        is_success: true,
        data: response?.data,
    }
}

exports.supplierPrintTiktokOrderPdfMerge = async (request, reply) => {
    const { user } = request
    const { id, document_type } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            document_type: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0].platform !== 'tiktok')
        throw new Error('platform must be Tiktok')

    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    const response = await TikTokInternalSvc.tiktokPrintOrder({
        partner_id: orderItems[0].partner_id,
        platform_shop_id: order.platform_shop_id,
        package_id: order.package_id,
        document_type, //  BEL = 1- PICK_LIST = 2- SL+PL = 3PACK_LIST is not available in this version.
        document_size: 0, // A6 = 0- A5 = 1
    })
    if (response)
        await Order.updateOrderById(id, { print_updated_at: new Date() })
    if (response?.data && response.data.doc_url) {
        const blob = await axios.get(response.data.doc_url, {
            responseType: 'arraybuffer',
        })

        return reply.code(200).send(blob.data)
    }

    return reply.code(400).send()
}

exports.sellerCancelOrder = async (request) => {
    // const { user } = request
    const { id, cancel_reason_key } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            cancel_reason_key: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const orderDetail = await Order.getOrder({ id })
    if (!orderDetail) throw new Error('Cannot find order')

    if (orderDetail.platform === 'tiktok') {
        const result = await TikTokInternalSvc.tikTokCancelOrder({
            partner_id: orderDetail.partner_id,
            platform_shop_id: orderDetail.platform_shop_id,
            shop_order_id: orderDetail.shop_order_id,
            cancel_reason_key,
        }).catch(() => ({
            is_success: false,
        }))

        return {
            is_success: true,
            data: result,
        }
    }

    return {
        is_success: true,
        data: [],
    }
}

exports.supplierOtherRTS = async (request) => {
    const { user } = request
    const { id, pick_option, required_note } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            pick_option: Joi.string(),
            required_note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')
    if (orderItems[0]?.fulfillment_status == ORDER_FULFILLMENT_STATUS.RTS)
        throw new AppError('order_ready_to_ship', {
            message: 'Đơn hàng đã sẵn sàng vận chuyển',
        })

    if (
        ![
            ORDER_FULFILLMENT_STATUS.SUP_PACKED,
            ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
        ].includes(orderItems[0]?.fulfillment_status)
    )
        throw new AppError('cant_set_rts', {
            message: 'Đơn hàng cần được xác nhận hoặc đã đóng gói',
        })

    const checkExistWarehouseWxport = await WarehouseImportVariation.getWarehouseExportDetail({
        order_id: id
    })

    if (!checkExistWarehouseWxport)
        throw new Error('Không tìm thấy phiếu xuất của đơn hàng này')

    await WarehouseImportVariation.updateSupplierExportWarehouse(
        {
            order_id: id
        },
        {
            time_export: new Date(),
            user_export_id: user.id
        }
    )

    let forCheckData
    const orderTmp = await Order.getOrderById(id)
    const dataSend = await OrderService.formatDataTransport(
        orderTmp,
        orderItems,
        pick_option,
        required_note
    )
    if (!orderItems[0].platform && dataSend) {
        if (orderItems[0].shipment_provider === 'GHTK') {
            forCheckData = await GHTKInternalSvc.GHTKSetRTS({
                ...dataSend,
                tenant_id: user.tenant_id,
            })
            if (!forCheckData) throw new Error('request_ghtk_fail')
            if (!forCheckData.success) throw new Error(forCheckData.message)
            await Order.updateOrderById(id, {
                status: ORDER_FULFILLMENT_STATUS.WAIT_TRANSPORT,
            })
            return {
                is_success: true,
                data: { forCheckData },
            }
        }
        if (orderItems[0].shipment_provider === 'GHN') {
            forCheckData = await GHNInternalSvc.ghnSetRTS({
                ...dataSend,
                tenant_id: user.tenant_id,
            })
            if (forCheckData.code !== 200) throw new Error(forCheckData.message)
            await Order.updateOrderById(id, {
                status: ORDER_FULFILLMENT_STATUS.WAIT_TRANSPORT,
            })
            return {
                is_success: true,
                data: { forCheckData },
            }
        }
    }

    await Order.updateOrderById(id, {
        fulfillment_status: ORDER_FULFILLMENT_STATUS.RTS,
        status: 'ready_to_ship',
        odii_status: ODII_ORDER_STATUS.WAIT_SHIPPING,
    })

    AuditLog.addOrderLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.UPDATE,
        source: request.odii_source,
        short_description: 'Đã sẵn sàng để vận chuyển',
        metadata: forCheckData?.data || forCheckData,
    })

    return {
        is_success: true,
        data: { forCheckData },
    }
}

exports.supplierPrintLabelGHTKPdf = async (request, reply) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const orderItems = await Order.getOrderItems(id, {
        supplier_id: supplierOfUser.id,
    })
    if (_.isEmpty(orderItems)) throw new Error('invalidOrder')

    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    let response
    let platform

    if (order.shipment_provider === 'GHTK') {
        response = await GHTKInternalSvc.ghtkPrintLabel({
            label_id: order.shop_order_id,
            tenant_id: user.tenant_id,
        })
        platform = 'GHTK'
    }

    if (order.shipment_provider === 'GHN') {
        response = await GHNInternalSvc.ghnPrintLabel({
            order_codes: [order.shop_order_id],
            tenant_id: user.tenant_id,
        })
        platform = 'GHN'
    }

    if (!response.success) throw new Error(response.message)

    if (response) {
        await Order.updateOrderById(id, { print_updated_at: new Date() })
    }
    if (response.data) {
        return {
            is_success: true,
            data: response?.data,
            platform: platform,
        }
    }
}

exports.supplierUpdateStatusQR = async (request) => {
    const { user } = request
    const { id, code } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            code: Joi.string().required(),
        })
        .validateAsync({ ...request.body, ...request.params }, { stripUnknown: true })

    const order = await Order.getOrderById(id)
    if (!order) throw new Error('order_not_found')

    const warehouse_variation = await WarehouseImportVariation.getWarehouseImportVariationDetail({
        code: code
    })

    if (!warehouse_variation)
        throw new Error('qr_code_not_found')

    const [orderItem] = await Order.getOrderItems(id, {
        product_id: warehouse_variation.product_id,
        product_variation_id: warehouse_variation.product_variation_id
    })

    if (!orderItem)
        throw new Error('Đơn hàng không có sản phẩm này')

    if (orderItem.order_item_quantity === orderItem.qr_checked)
        throw new Error('Sản phẩm này đã có đủ trong đơn hàng')

    const warehouse_export = await WarehouseImportVariation.getWarehouseExportDetail(
        { order_id: id }
    )

    if (!warehouse_export) {
        throw new Error('Không tìm thấy phiếu xuất của đơn hàng này')
    }

    const data = await knex.transaction(async (trx) => {
        await Order.incrementQrOrderItem(
            {
                order_id: id,
                product_id: warehouse_variation.product_id,
                product_variation_id: warehouse_variation.product_variation_id
            },
            {
                qr_checked: 1
            },
            {
                trx
            }
        )
        const product_stock_variation = ProductVariationStock.getProductVariationStockById(orderItem.order_item_product_variation_stock_id)
        if (product_stock_variation.real_quantity <= 0) {
            throw new Error('Tồn kho thực của sản phẩm này đã hết')
        }
        const export_variation = await WarehouseImportVariation.getExportWarehouseVariation({
            order_id: id,
            order_item_id: orderItem.order_item_id,
            code: code
        })
        await ProductVariationStock.decrementQtyProductVariationStock(orderItem.order_item_product_variation_stock_id, 1, { trx })
        await ProductStock.decrementQtyProductStock(orderItem.order_item_product_stock_id, 1, { trx })
        await WarehouseImportVariation.incrementRemainingQty(code, 1, { trx })
        if (export_variation) {
            await WarehouseImportVariation.incrementExportWarehouseVariation(
                {
                    order_id: id,
                    order_item_id: orderItem.order_item_id,
                    code: code,
                },
                {
                    total_quantity: 1
                },
                {
                    trx
                }
            )
        } else {
            await WarehouseImportVariation.insertExportWarehouseVariation(
                {
                    order_id: id,
                    order_item_id: orderItem.order_item_id,
                    code: code,
                    warehouse_export_id: warehouse_export.id,
                },
                {
                    trx
                }
            )
        }


        return orderItem
    })

    return {
        is_success: true,
        data
    }
}
