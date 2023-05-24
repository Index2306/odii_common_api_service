const Product = require('../models/product')
const Store = require('../models/store')
const User = require('../models/user')
const Order = require('../models/order')
const Transaction = require('../models/transaction')
const { mapOderWithStatus } = require('../utils/common.util')

exports.getDataByType = async (name) => {
    const result = {}
    switch (name) {
        case 'product':
            // eslint-disable-next-line no-case-declarations
            const product = await Product.countProduct()
            result.product_pending_for_review = product.count
            break
        case 'transaction':
            // eslint-disable-next-line no-case-declarations
            const transaction = await Transaction.countTransaction({
                status: 'pending',
            })
            result.transaction_pending_for_review = transaction.count
            break
        case 'store':
            // eslint-disable-next-line no-case-declarations
            const store = await Transaction.countTransaction({
                status: 'pending',
            })
            result.new_store = store.count
            break
        default:
            result.data = 'Not data'
    }

    return result
}

exports.infoSeller = async (partner_id, options = {}) => {
    const [
        countImportProduct,
        countProductOnSale,
        countOrder,
        countStore,
        countStaff,
    ] = await Promise.all([
        Product.countImportProduct(partner_id),
        Product.countProductOnSale(partner_id),
        Order.countOrder(partner_id),
        Store.countStoreByPartnerId(partner_id),
        User.getUserPartner(partner_id),
    ])

    return {
        count_import_product: countImportProduct.count,
        count_product_on_sale: countProductOnSale.count,
        count_order: countOrder.count,
        count_store: countStore.count,
        count_staff: countStaff.length,
    }
}

exports.infoNewOrder = async (options) => {
    const data = await Order.countOrderTodayForStore(options)

    const result = await mapOderWithStatus(data)

    return result
}

exports.infoSupplierToday = async (options = {}) => {
    const [countImportProduct, countOrder, countStore] = await Promise.all([
        Product.countImportProduct(options.supplier_id),
        Product.countProductOnSale(options.supplier_id),
        Order.countOrder(options.supplier_id),
        Store.countStoreByPartnerId(options.supplier_id),
    ])

    return {
        new_product: countImportProduct.count,
        new_order: countOrder.count,
        new_views: countStore.count,
    }
}
