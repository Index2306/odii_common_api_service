exports.BOT_USER_ID = '1'
exports.ACCOUNTING_USER_ID = '2'
exports.ACCOUNTING_PARTNER_ID = '2'
exports.ACCOUNTING_BALANCE_ID = '2'
exports.ROLES_ID_OF_ADMIN = [1, 2, 3, 4, 5, 6, 7, 8, 19, 20, 22, 23, 24]

exports.ADMIN_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN_PRODUCT: 'admin_product',
    ADMIN_ORDER: 'admin_order',
    ADMIN_USER: 'admin_user',
    ADMIN_BALANCE: 'admin_balance',
}

exports.ROLES = {
    // SUPER_ADMIN: 'super_admin',
    // ADMIN_PRODUCT: 'admin_product',
    // ADMIN_ORDER: 'admin_order',
    // ADMIN_USER: 'admin_user',
    // ADMIN_BALANCE: 'admin_balance',
    ...exports.ADMIN_ROLES,
    OWNER: 'owner',
    PARTNER_PRODUCT: 'partner_product',
    PARTNER_ORDER: 'partner_order',
    PARTNER_BALANCE: 'partner_balance',
    PARTNER_USER: 'partner_user',
    PARTNER_MEMBER: 'partner_member',
    PARTNER_STORE: 'partner_store',
    ACCOUNTANT: 'admin_accountant',
    CHIEF_ACCOUNTANT: 'admin_chief_accountant',
    PARTNER_SOURCE: 'partner_source',
    PARTNER_WAREHOUSE: 'partner_warehouse',
    PARTNER_CHIEf_WAREHOUSE: 'partner_chief_warehouse',
}

exports.ROLE_OWNER_ID = 1

exports.CURRENCY_CODE = {
    VND: 'VND',
    USD: 'USD',
}

exports.ACC_TYPE = {
    SUP: 'supplier',
    ADMIN: 'admin',
    SELLER: 'seller',
}

exports.AFFILIATE_ACC_TYPES = [exports.ACC_TYPE.SELLER]

exports.ACC_TYPE_ARR = Object.values(exports.ACC_TYPE)

exports.STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
}
exports.STATUS_ITEM = [exports.STATUS.ACTIVE, exports.STATUS.INACTIVE]
exports.READ_STATUS = {
    READ: 'read',
    UNREAD: 'unread',
}
exports.USER_GENDER = {
    MALE: 'male',
    FEMALE: 'female',
    OTHER: 'other',
}

exports.STATUS_ARR = Object.values(exports.STATUS)

exports.COLLECTION_TYPE = {
    MANUAL: 'manual',
    AUTO: 'auto',
}

exports.COLLECTION_DISJUNCTIVE = {
    AND: 'and',
    OR: 'or',
}

exports.COLLECTION_DISJUNCTIVE_ARR = Object.values(
    exports.COLLECTION_DISJUNCTIVE
)

exports.BALANCE_TYPE = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
}

exports.BALANCE_TYPE_ARR = Object.values(exports.BALANCE_TYPE)

exports.TRANSACTION_METHOD = {
    BANK: 'bank',
    MOMO: 'momo',
    DEBT: 'debt',
    ODII: 'odii',
    CHECK: 'check',
}

exports.TRANSACTION_TYPE = {
    WITHDRAWAL: 'withdrawal',
    DEPOSIT: 'deposit',
}

exports.TRANSACTION_FILTER = {
    PAY: 'pay',
    RECEIVE: 'receive',
    WITHDRAWAL: 'withdrawal',
    DEPOSIT: 'deposit',
    SUP_REVENUE: 'sup_revenue',
    SUP_WALLET: 'sup_wallet',
}

exports.TRANSACTION_STATUS = {
    CREATED: 'created',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
}
exports.TRANSACTION_STATUS_ARR = Object.values(exports.TRANSACTION_STATUS)

exports.TRANSACTION_ACTION = {
    DEPOSIT: 'deposit',
    // SELLER_DEPOSIT: 'seller_deposit',
    // SUPPLIER_DEPOSIT: 'supplier_deposit',

    WITHDRAWAL: 'withdrawal',
    // SELLER_WITHDRAWAL: 'seller_withdrawal',
    // SUPPLIER_WITHDRAWAL: 'supplier_withdrawal',

    CONFIRM_ORDER: 'confirmed_order',
    ADMIN_CONFIRM_TRANSACTION: 'admin_confirm_transaction',
    // SELLER_CONFIRM_ORDER: 'seller_confirmed_order',
    // SUPPLIER_CONFIRM_ORDER: 'supplier_confirmed_order',

    SELLER_GET_REFUND: 'seller_get_refund',
    SUP_FF_FAIL: 'supplier_fulfill_fail',
    AFFILIATE_COMMISSION: 'affiliate_commission',
    PROMOTIONAL_GET_REFUND: 'promotional_get_refund',
    SHIPPING_FEE: 'shipping_fee',
    COD: 'cod',
}

// active|inactive|publish|pending_for_review
exports.PRODUCT_PUBLISH_STATUS = {
    REJECTED: 'rejected',
    INACTIVE: 'inactive',
    PENDING_FOR_REVIEW: 'pending_for_review',
    ACTIVE: 'active',
}
exports.PRODUCT_PUBLISH_STATUS_ARR = Object.values(
    exports.PRODUCT_PUBLISH_STATUS
)

exports.SALE_CHANNEL = {
    PERSONAL: 'personal',
    SHOPEE: 'shopee',
    LAZADA: 'lazada',
    SHOPIFY: 'shopify',
    WOO: 'woocommerce',
    TIKTOK: 'tiktok',
}

exports.STORE_PRODUCT_PUBLISH_STATUS = {
    REJECTED: 'rejected',
    INACTIVE: 'inactive',
    READY: 'ready',
    PENDING: 'pending',
    ACTIVE: 'active',
    DEACTIVE: 'deactive',
    DELETE: 'deleted',
}

exports.SALE_CHANNEL_ARR = Object.values(exports.SALE_CHANNEL)

// exports.ORDER_STATUS = {
//     OPEN: 'open',
//     CLOSE: 'closed', // completed
//     CANCELLED: 'cancelled',
// }

// exports.ORDER_PAYMENT_STATUS = {
//     PENDING: 'pending',
//     PARTIAL_PAID: 'partially_paid',
//     PAID: 'paid',
//     PARTIAL_REFUNDED: 'partially_refunded',
//     REFUNDED: 'refunded',
//     VOIDED: 'voided',
// }

// exports.ORDER_FULFILLMENT_STATUS = {
//     FULFILLED: 'fulfilled',
//     PARTIAL: 'partial',
//     RESTOCKED: 'restocked',
// }

exports.SUP_STATUS = {
    INACTIVE: 'inactive',
    PENDING_FOR_REVIEW: 'pending_for_review',
    ACTIVE: 'active',
}

exports.REDIS_KEY = {
    CATEGORY: 'category_key',
    ADMIN_CATEGORY: 'admin_category_key',
    CATEGORY_FIELD: 'category_field',
    STATS: 'stats',
    STATS_SELLER: 'stats_seller',
    STATS_SELLER_ORDER: 'stats_order_seller',
    SELLER_CONNECT: 'seller_connect',
    PROMOTION: 'promotion_key',
}

exports.ODII_PRICE_EXT = 1.0
exports.MAD_PRICE = 9999999999

exports.HEADER_PRODUCT = {
    HANDLE: 'handle',
    NAME: 'name',
    DESCRIPTION: 'description',
    VENDOR: 'vendor',
    CATEGORIES: 'categories',
    TAGS: 'tags',
    BARCODE: 'barcode',
    SKU: 'sku',
    ORIGIN_SUPPLIER_PRICE: 'origin_supplier_price',
    CURRENCY_CODE: 'currency_code',
    RETAIL_PRICE: 'retail_price',
    LOW_RETAIL_PRICE: 'low_retail_price',
    HIGH_RETAIL_PRICE: 'high_retail_price',
    TOTAL_QUANTITY: 'total_quantity',
    WEIGHT_GRAMS: 'weight_grams',
    OPTION_1_NAME: 'option_1_name',
    OPTION_1_VALUE: 'option_1_value',
    OPTION_2_NAME: 'option_2_name',
    OPTION_2_VALUE: 'option_2_value',
    OPTION_3_NAME: 'option_3_name',
    OPTION_3_VALUE: 'option_3_value',
    STATUS: 'status',
    VARIANT_IMAGE: 'variant_image',
    WAREHOUSING_ID: 'warehousing_id',
    PRODUCT_IMAGE_IDS: 'product_image_ids',
}

exports.BULL_QUEUES = {
    WORKER_UPDATE: 'worker-update',
    WORKER_CRAWL: 'craw-logo',
}

exports.BULL_JOBS = {
    UPDATE_PRODUCT: 'update-product',
    UPDATE_PRODUCT_CATE: 'update-product-cate',
    INSERT_LOGO: 'insert-logo',
    GET_TRANSACTION: 'get-transaction',
    UPDATE_DISCOUNT: 'update-discount',
}

exports.ES_INDEX = {
    PRODUCT: 'product',
}

exports.TIME_ZONE = {
    VN_TZ: 'Asia/Ho_Chi_Minh',
}

exports.LAZ_DOCUMENT_TYPE = {
    INVOICE: 'invoice',
    SHIPPING_LABEL: 'shippingLabel',
    CARRIER_MANIFEST: 'carrierManifest',
}

exports.DISCOUNT = {
    CASH: 'cash',
    PERCENT: 'percent',
}
exports.APPLY_FOR = {
    all: 'all',
    selected: 'selected',
}

exports.INVENTORY_CHANGE_TYPE = {
    ADD: 1,
    UPDATE: 2,
    REAL: 3,
    IMPORT: 4,
}
