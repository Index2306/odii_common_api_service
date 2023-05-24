exports.ORDER_STATUS = {
    OPEN: 'open',
    CLOSE: 'closed', // completed
    CANCELED: 'canceled',
}

exports.ORDER_PAYMENT_STATUS = {
    PENDING: 'pending',
    PARTIAL_PAID: 'partially_paid',
    PAID: 'paid',
    PARTIAL_REFUNDED: 'partially_refunded',
    REFUNDED: 'refunded',
    VOIDED: 'voided',
}

exports.ORDER_FULFILLMENT_STATUS = {
    PENDING: 'pending',
    SELLER_CONFIRMED: 'seller_confirmed',
    SUP_CONFIRMED: 'supplier_confirmed',
    SUP_PACKED: 'supplier_packed',
    SELLER_REJECTED: 'seller_rejected',
    SUP_REJECTED: 'sup_rejected',
    SELLER_CANCELLED: 'seller_cancelled',
    SUP_CANCELLED: 'sup_cancelled',
    SELLER_IGNORED: 'seller_ignored',
    PLATFORM_CANCELLED: 'platform_cancelled',
    BUYER_CANCELLED: 'buyer_cancelled',
    PLATFORM_DELIVERED: 'platform_delivered',
    SELLER_DELIVERED: 'seller_delivered',
    SELLER_RETURNED: 'seller_returned',
    FULFILLED: 'fulfilled',
    FAILED: 'failed',
    PARTIAL: 'partial',
    RESTOCKED: 'restocked',
    RTS: 'ready_to_ship',
    WAIT_TRANSPORT: 'wait_transport'
}

exports.LAZADA_ORDER_STATUS = {
    PACKED: 'packed',
    UNPAID: 'unpaid',
    PENDING: 'pending',
    CANCELED: 'canceled',
    RTS: 'ready_to_ship',
    DELIVERED: 'delivered',
    RETURNED: 'returned',
    SHIPPED: 'shipped',
    FAILED: 'failed',
}
// Product status
const PRODUCT_STATUS = {
    ALL: 0,
    DRAF: 1,
    AWAITING: 2,
    SELLING: 3,
    REJECTED: 4,
    STOPSELL: 5,
}
exports.PRODUCT_STATUS = PRODUCT_STATUS
exports.PRODUCT_STATUS_ARR = [
    PRODUCT_STATUS.ALL,
    PRODUCT_STATUS.DRAF,
    PRODUCT_STATUS.AWAITING,
    PRODUCT_STATUS.SELLING,
    PRODUCT_STATUS.REJECTED,
    PRODUCT_STATUS.STOPSELL,
]
exports.KEY_PRODUCT_STATUS = [
    'product_all',
    'product_draf',
    'product_awaitting',
    'product_selling',
    'product_rejected',
    'product_stopsell',
]
exports.PRODUCT_STATUS_MAP = {
    [PRODUCT_STATUS.ALL]: {
        status: null,
        publish_status: null,
    },
    [PRODUCT_STATUS.DRAF]: {
        status: 'inactive',
        publish_status: 'inactive',
    },
    [PRODUCT_STATUS.AWAITING]: {
        status: 'inactive',
        publish_status: 'pending_for_review',
    },
    [PRODUCT_STATUS.SELLING]: {
        status: 'active',
        publish_status: 'active',
    },
    [PRODUCT_STATUS.REJECTED]: {
        status: 'inactive',
        publish_status: 'rejected',
    },
    [PRODUCT_STATUS.STOPSELL]: {
        status: 'active',
        publish_status: 'inactive',
    },
}
// transaction confirm status
exports.CONFIRM_STATUS = {
    PENDING: 'pending',

    PLATFORM_CANCELLED: 'platform_cancelled',
    PLATFORM_CONFIRMED: 'platform_confirmed',

    SELLER_CANCELLED: 'seller_cancelled',
    SELLER_RETURNED: 'seller_returned',
    SELLER_CONFIRMED: 'seller_confirmed',

    SUPPLIER_CANCELLED: 'supplier_cancelled',

    ACCOUNTANT_CONFIRMED: 'accountant_confirmed',
    ACCOUNTANT_REJECTED: 'accountant_rejected',

    // PENDING_FOR_CHIEF_ACCOUNTANT: 'pending_for_chief_accountant',
    CHIEF_ACCOUNTANT_CONFIRMED: 'chief_accountant_confirmed',
    CHIEF_ACCOUNTANT_REJECTED: 'chief_accountant_rejected',

    REJECTED: 'rejected',
    COMPLETED: 'completed',
}
// order
exports.CANCEL_STATUS = {
    PLATFORM_CANCELLED: 'platform_cancelled',
    SELLER_CANCELLED: 'seller_cancelled',
    SELLER_REQUEST_CANCELL: 'seller_cancelled',
    SUP_CANCELLED: 'supplier_cancelled',
    SUP_REQUEST_CANCELL: 'supplier_cancelled',
    CANCELLED: 'canceled',
}

const FILTER_TAB_STATUS = {
    ALL: 0,
    UNPAID: 1,
    PENDING: 2,
    AWAITING_COLLECTION: 3,
    SHIPPING: 4,
    DELIVERED: 5,
    CANCELLED: 6,
    OTHER: 7,
}
exports.ODII_ORDER_STATUS = {
    UNPAID: 1, // chua thanh toan
    PENDING: 2, // cho xu ly
    WAIT_SHIPPING: 3, // cho lay hang
    SHIPPING: 4, // dang van chuyen
    DELIVERED: 5, // da giao hang
    CANCELED: 6, // da huy
    UNDEFINED: 7, // chua xac dinh
}
exports.ODII_ORDER_STATUS_NAME = {
    1: 'Chưa thanh toán',
    2: 'Chờ xử lý',
    3: 'Chờ lấy hàng',
    4: 'Đang vận chuyển',
    5: 'Đã giao hàng',
    6: 'Đã hủy',
    7: 'Chưa xác định',
}
exports.ODII_SELLER_PRODUCT_STATUS = [
    'product_all',
    'product_inactive',
    'product_active',
]
// Filter tab order
exports.FILTER_TAB_STATUS = FILTER_TAB_STATUS
exports.FILTER_TAB_STATUS_ARR = [
    FILTER_TAB_STATUS.ALL,
    FILTER_TAB_STATUS.UNPAID,
    FILTER_TAB_STATUS.PENDING,
    FILTER_TAB_STATUS.AWAITING_COLLECTION,
    FILTER_TAB_STATUS.SHIPPING,
    FILTER_TAB_STATUS.DELIVERED,
    FILTER_TAB_STATUS.CANCELLED,
    FILTER_TAB_STATUS.OTHER,
]
exports.KEY_ORDER_STATUS = [
    'order_all',
    'order_unpaid',
    'order_pending',
    'order_awaiting_collection',
    'order_shipping',
    'order_delivered',
    'order_cancelled',
    'order_other',
]
exports.ORDER_PLATFORM_STATUS = {
    LAZADA: {
        [FILTER_TAB_STATUS.UNPAID]: ['unpaid'],
        [FILTER_TAB_STATUS.PENDING]: ['pending'],
        [FILTER_TAB_STATUS.AWAITING_COLLECTION]: [
            'topack',
            'toship',
            'ready_to_ship',
        ],
        [FILTER_TAB_STATUS.SHIPPING]: ['shipping', 'shipped'],
        [FILTER_TAB_STATUS.DELIVERED]: ['delivered'],
        [FILTER_TAB_STATUS.CANCELLED]: ['canceled'],
        other: [
            'returned',
            'failed',
            'lost',
            // additional
            'shipped_back_success',
            'shipped_back',
            'package_scrapped',
        ],
    },
    SHOPEE: {
        [FILTER_TAB_STATUS.UNPAID]: ['UNPAID'],
        [FILTER_TAB_STATUS.PENDING]: ['READY_TO_SHIP'],
        [FILTER_TAB_STATUS.AWAITING_COLLECTION]: [
            'PROCESSED',
            'READY_TO_PRINT',
        ],
        [FILTER_TAB_STATUS.SHIPPING]: ['SHIPPED'],
        [FILTER_TAB_STATUS.DELIVERED]: [
            'COMPLETED',
            'INVOICE_PENDING',
            'TO_CONFIRM_RECEIVE',
        ],
        [FILTER_TAB_STATUS.CANCELLED]: ['IN_CANCEL', 'CANCELLED'],
        other: [],
    },
    // '100', // UNPAID
    // '111', // AWAITING_SHIPMENT
    // '112', // AWAITING_COLLECTION
    // '114', // PARTIALLY_SHIPPING
    // '121', // IN_TRANSIT
    // '122', // DELIVERED
    // '130', // COMPLETED
    // '140', // CANCELLED
    TIKTOK: {
        [FILTER_TAB_STATUS.UNPAID]: ['100', 'UNPAID'],
        [FILTER_TAB_STATUS.PENDING]: ['111', 'AWAITING_SHIPMENT'],
        [FILTER_TAB_STATUS.AWAITING_COLLECTION]: ['112'],
        [FILTER_TAB_STATUS.SHIPPING]: ['114', '121'],
        [FILTER_TAB_STATUS.DELIVERED]: ['122', '130'],
        [FILTER_TAB_STATUS.CANCELLED]: ['140', 'CANCEL'],
        other: [],
    },
}
