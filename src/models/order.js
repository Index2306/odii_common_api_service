// const { x } = require('joi')
// const _ = require('lodash')
const _ = require('lodash')
const { some, isEmpty } = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const PromotionCtl = require('../controllers/promotion')
// const { ORDER_STATUS } = require('../constants')
const {
    getBasicStore,
    getBasicWarehousing,
    getBasicLocation,
    getBasicSup,
} = require('./model-helper')
const {
    FILTER_TAB_STATUS,
    ORDER_PLATFORM_STATUS,
    FILTER_TAB_STATUS_ARR,
    ORDER_FULFILLMENT_STATUS,
} = require('../constants/oms-status')
const { default: logger } = require('../logger')

// TODO: ORDER

/**
 * enum order_fulfillment_status_enum {
    fulfilled [note: 'Every line item in the order has been fulfilled.']
    partial [note: 'At least one line item in the order has been fulfilled.']
    restocked [note: 'Every line item in the order has been restocked and the order canceled.']
}
enum financial_status_enum {
    pending [note: 'The payments are pending. Payment might fail in this state. Check again to confirm whether the payments have been paid successfully.']
    authorized [note: 'The payments have been authorized.']
    partially_paid [note: 'The order have been partially paid.']
    paid [note: 'The payments have been paid.']
    partially_refunded [note: 'The payments have been partially refunded.']
    refunded [note: 'The payments have been refunded.']
    voided [note: 'The payments have been voided.']
}
enum order_status_enum {
    open
    closed
    cancelled
}
 */

exports.insertOrder = (data, { trx } = {}) =>
    getKnex('order', trx).returning('id').insert(data)

exports.updateOrder = (condition, data, { trx } = {}) =>
    getKnex('order', trx).update(data).where(condition)

exports.updateOrderById = (id, data, { trx } = {}) =>
    exports.updateOrder({ id }, data, { trx })

exports.getOrder = (condition) => knex.first().from('order').where(condition)

exports.getOrders = (condition) => knex.select().from('order').where(condition)

exports.getOrderById = (id) => exports.getOrder({ id })
exports.getOrderByIds = (ids, condition) =>
    knex.select().from('order').whereIn('id', ids).andWhere(condition)
exports.getOrderItems = (orderId, options = {}) => {
    const query = knex('order')
        .select(
            'store.platform_shop_id',
            'shop_order_item_id',
            'order_item.id as order_item_id',
            'order_item.product_id as order_item_product_id',
            'order_item.product_variation_id as order_item_product_variation_id',
            'order_item.product_stock_id as order_item_product_stock_id',
            'order_item.product_variation_stock_id as order_item_product_variation_stock_id',
            'order_item.quantity as order_item_quantity',
            'order_item.status as order_item_status',
            'order_item.qr_checked',
            'order_item.raw_data as raw_data',
            'order.platform',
            'order.partner_id',
            'order.shipment_provider',
            'order.fulfillment_status',
            'order.tracking_id',
            'product_variation.weight_grams',
            knex.raw(
                `(CASE WHEN (product.has_variation = true) THEN CONCAT(product.name,',' ,product_variation.option_1,',' ,product_variation.option_2,',' ,product_variation.option_3) ELSE product.name END) as product_name`
            )
        )
        .leftJoin('order_item', 'order.id', 'order_item.order_id')
        .leftJoin('store', 'order.store_id', 'store.id')
        .innerJoin(
            'product_variation',
            'order_item.product_variation_id',
            'product_variation.id'
        )
        .innerJoin('product', 'order_item.product_id', 'product.id')
        .where('order.id', orderId)
    if (options.supplier_id)
        query.andWhere('order.supplier_id', options.supplier_id)
    if (options.product_id)
        query.andWhere('order_item.product_id', options.product_id)
    if (options.product_variation_id)
        query.andWhere('order_item.product_variation_id', options.product_variation_id)

    return query
}

// TODO: ORDER ITEM

exports.getAllOrderItems = (condition) => {
    const { promotion_id, product_variation_id } = condition
    const query = knex
        .select('oi.*')
        .from('order_item as oi')
        .innerJoin('order as o', 'oi.order_id', 'o.id')
        .where('oi.promotion_id', promotion_id)
        .andWhere('oi.product_variation_id', product_variation_id)
        .andWhere({ 'o.odii_status': 5 })

    return query
}

exports.insertOrderItems = (data, { trx } = {}) =>
    getKnex('order_item', trx).returning('id').insert(data)

exports.updateOrderItem = (condition, data, { trx } = {}) =>
    getKnex('order_item', trx).update(data).where(condition)

const combineObjects = (source, orderStatus) => {
    const desSource = []
    if (Array.isArray(source[1])) {
        if (orderStatus !== FILTER_TAB_STATUS.ALL) {
            desSource.push(...source[orderStatus])
        } else {
            for (const keyItem of Object.keys(source)) {
                desSource.push(...source[keyItem])
            }
        }
    } else {
        for (const key of Object.keys(source)) {
            const sourceItem = source[key]
            if (sourceItem instanceof Object) {
                if (orderStatus !== FILTER_TAB_STATUS.ALL) {
                    desSource.push(...sourceItem[orderStatus])
                } else {
                    for (const keyItem of Object.keys(sourceItem)) {
                        desSource.push(...sourceItem[keyItem])
                    }
                }
            } else {
                desSource.push(...sourceItem)
            }
        }
    }

    return desSource
}

const getShopStatusFilter = (orderStatus, platform = '') => {
    const isPlatformEmpty = _.isEmpty(platform) || platform === 'other'
    const dataFilter = !isPlatformEmpty
        ? ORDER_PLATFORM_STATUS[platform.toUpperCase()]
        : ORDER_PLATFORM_STATUS

    return combineObjects(dataFilter, orderStatus)
}

exports.getOrderListing = async (options = {}, whereCondition) => {
    const selectArr = [
        'o.*',
        getBasicStore(),
        getBasicWarehousing(),
        getBasicLocation(),

        // knex.raw(
        //     `json_build_object('id', store.id, 'name', store.name, 'platform', store.platform, 'logo', store.logo) as store`
        // ),
        // knex.raw('row_to_json("sw".*) as supplier_warehousing'),
        // knex.raw('row_to_json("from".*) as from_location'),
        knex.raw(
            `ARRAY(SELECT row_to_json(oi.*)
            FROM order_item as oi
            LEFT JOIN product as p ON oi.product_id = p.id
            WHERE order_id = o.id AND ${options.product_source_ids
                ? `p.product_source_id IN (${options.product_source_ids})`
                : 'p.id = oi.product_id'
            }
            ) AS order_item`
        ),
    ]
    let counterQuery = knex().first().countDistinct('o.id').from('order as o')

    let query = knex
        .select(selectArr)
        .from('order as o')
        .leftJoin('store', 'o.store_id', 'store.id')
        .leftJoin(
            'supplier_warehousing as sw',
            'o.supplier_warehousing_id',
            'sw.id'
        )
        .leftJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('order_item as oi', 'o.id', 'oi.order_id')
        .leftJoin('product as p', 'oi.product_id', 'p.id')
        .groupBy('o.id', 'store.id', 'sw.id', 'from.id')
    const condition = {
        'o.is_deleted': false,
        is_map: true, // TODO TuanTH comment => get both Odii + Platform
    }

    if (options.partner_id && !options.product_source_ids)
        condition['o.partner_id'] = options.partner_id

    if (options.product_source_ids) {
        query.whereIn('p.product_source_id', options.product_source_ids)
        counterQuery
            .leftJoin('order_item as oi', 'o.id', 'oi.order_id')
            .leftJoin('product as p', 'oi.product_id', 'p.id')
            .whereIn('p.product_source_id', options.product_source_ids)
    }

    if (options.tenant_id) condition['o.tenant_id'] = options.tenant_id

    if (whereCondition.id) condition['o.id'] = whereCondition.id
    if (whereCondition.code) condition['o.code'] = whereCondition.code
    if (whereCondition.status) condition['o.status'] = whereCondition.status
    if (whereCondition.odii_status)
        condition['o.odii_status'] = whereCondition.odii_status
    if (whereCondition.supplier_warehousing_id)
        condition['o.supplier_warehousing_id'] =
            whereCondition.supplier_warehousing_id
    if (whereCondition.supplier_id && !options.product_source_ids)
        condition['o.supplier_id'] = whereCondition.supplier_id
    if (whereCondition.store_id)
        condition['o.store_id'] = whereCondition.store_id
    if (whereCondition.fulfillment_status)
        condition['o.fulfillment_status'] = whereCondition.fulfillment_status
    if (whereCondition.payment_status)
        condition['o.payment_status'] = whereCondition.payment_status

    if (whereCondition?.platform) {
        const shopPlatform = whereCondition.platform
        if (shopPlatform === 'other') {
            query.andWhere('o.platform', 'is', null)
        }
        if (shopPlatform !== 'other') {
            condition['o.platform'] = whereCondition.platform
        }
    }

    if (whereCondition?.print_status) {
        const statusPrint = whereCondition.print_status
        if (statusPrint === 'unprinted') {
            query
                .where('o.print_updated_at', 'is', null)
                .andWhere('o.platform', 'is not', null)
        }
        if (statusPrint === 'printed') {
            query.andWhere('o.print_updated_at', 'is not', null)
        }
    }

    // if (whereCondition.order_status >= 0) {
    //     const shopStatus = getShopStatusFilter(
    //         whereCondition.order_status,
    //         whereCondition.platform
    //     )
    // }

    if (whereCondition?.from_time) {
        query.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
        counterQuery.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    }
    if (whereCondition?.to_time) {
        query.andWhere('o.created_at', '<=', whereCondition.to_time)
        counterQuery.andWhere('o.created_at', '<=', whereCondition.to_time)
    }
    if (options.fulfillment_status) {
        // Filter tab supplier_confirmed inclue supplier packed
        query.whereIn('o.fulfillment_status', options.fulfillment_status)
        // counterQuery.whereIn('o.fulfillment_status', options.fulfillment_status)
    }
    if (options.not_fulfillment_status) {
        query.andWhere(
            'o.fulfillment_status',
            '<>',
            options.not_fulfillment_status
        )
        counterQuery.andWhere(
            'o.fulfillment_status',
            '<>',
            options.not_fulfillment_status
        )
    }

    /*
     * Filter order created by Platform
     * Date: 02/07/2022
     * Created: TuanTH
     * */
    // if (!options.isNotOdii) {
    //     query.andWhere('o.shop_order_id', null)
    // } else {
    //     query.whereNotNull('o.shop_order_id')
    // }

    if (whereCondition.customer_keywords) {
        query = query.where((builder) => {
            builder
                .where(
                    'customer_email',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )
                .orWhere(
                    'customer_phone',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )
                .orWhere(
                    'customer_full_name',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )

            return builder
        })
        counterQuery = counterQuery.where((builder) => {
            builder
                .where(
                    'customer_email',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )
                .orWhere(
                    'customer_phone',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )
                .orWhere(
                    'customer_full_name',
                    'ilike',
                    `%${whereCondition.customer_keywords}%`
                )

            return builder
        })
    }
    if (whereCondition.keyword) {
        query = query.where((builder) => {
            builder
                .where(
                    'o.customer_email',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere(
                    'o.customer_phone',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere(
                    'o.customer_full_name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere('o.code', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere(
                    'o.invoice_number',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

            return builder
        })
        counterQuery = counterQuery.where((builder) => {
            builder
                .where(
                    'o.customer_email',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere(
                    'o.customer_phone',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere(
                    'o.customer_full_name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )
                .orWhere('o.code', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere(
                    'o.invoice_number',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

            return builder
        })
    }
    if (whereCondition.order_status > 0) {
        // const shopStatus = getShopStatusFilter(
        //     whereCondition.order_status,
        //     whereCondition.platform
        // )
        condition['o.odii_status'] = whereCondition.order_status
        // query.whereIn('o.odii_status', order_status)
    }
    query.andWhere(condition)
    // console.log('query = ', query.toString())

    // query.groupBy('')

    const result = await query
        .orderBy(options.order_by || 'o.id', options.order_direction)
        .paginate(options.paginate)
    // Get odii order status summary
    const summary = []
    for (let idx = 0; idx < FILTER_TAB_STATUS_ARR.length; idx += 1) {
        const status = FILTER_TAB_STATUS_ARR[idx]
        if (
            status === whereCondition.order_status &&
            status !== FILTER_TAB_STATUS.PENDING
        ) {
            summary.push({
                order_status: status,
                record_cnt: result.pagination.total,
            })
        } else {
            const cloneSummary = counterQuery.clone()
            if (status === 0) {
                delete condition['o.odii_status']
            } else {
                condition['o.odii_status'] = status
            }
            delete condition['o.fulfillment_status']
            // eslint-disable-next-line no-await-in-loop
            const resultCnt = await cloneSummary.andWhere(condition)
            summary.push({
                order_status: status,
                record_cnt: resultCnt.count,
            })
            // Add full filment status summary
            if (status === FILTER_TAB_STATUS.PENDING) {
                const filterArr = [
                    'pending',
                    'seller_confirmed',
                    'supplier_confirmed',
                ]
                for (let ffIdx = 0; ffIdx < filterArr.length; ffIdx += 1) {
                    condition['o.fulfillment_status'] = filterArr[ffIdx]
                    const cloneSummaryFf = counterQuery.clone()
                    if (filterArr[ffIdx] === 'supplier_confirmed') {
                        delete condition['o.fulfillment_status']
                        // eslint-disable-next-line no-await-in-loop
                        const cnt = await cloneSummaryFf
                            .andWhere(condition)
                            .whereIn('o.fulfillment_status', [
                                ORDER_FULFILLMENT_STATUS.SUP_CONFIRMED,
                                ORDER_FULFILLMENT_STATUS.SUP_PACKED,
                                ORDER_FULFILLMENT_STATUS.RTS,
                            ])
                        summary.push({
                            order_status: filterArr[ffIdx],
                            record_cnt: cnt.count,
                        })
                    } else {
                        // eslint-disable-next-line no-await-in-loop
                        const cnt = await cloneSummaryFf.andWhere(condition)
                        summary.push({
                            order_status: filterArr[ffIdx],
                            record_cnt: cnt.count,
                        })
                    }
                }
            }
        }
    }
    const orderids = result?.data?.map((item) => `${item.id}`)
    const findIds = `${orderids.join(',')}`
    const lowPriceOrders = (
        await knex.raw(`SELECT * from find_order_low_price('${findIds}')`)
    ).rows

    const allDatas = result.data.map(async (order) => {
        const allItems = order?.order_item.map(async (item) => {
            let dataPrmotion
            let finalPrice
            if (order.fulfillment_status === 'pending') {
                dataPrmotion = await exports.getPromotionAndOrderSeller(
                    item.order_id,
                    item.id
                )
            } else {
                dataPrmotion = await exports.getPromotionAndOrder(
                    item.order_id,
                    item.id
                )
            }

            if (!isEmpty(dataPrmotion))
                if (dataPrmotion.prtType === 'product_by') {
                    finalPrice = PromotionCtl.disCountFormula(
                        item.origin_supplier_price,
                        dataPrmotion?.value,
                        1,
                        !!(dataPrmotion?.type === 'percent')
                    )
                    dataPrmotion = {
                        ...dataPrmotion,
                        finalPrice: finalPrice || 0,
                    }
                }
            item.promotion = dataPrmotion || {}

            return { ...item }
        })
        order.order_item = await Promise.all(allItems)
    })

    await Promise.all(allDatas)

    return {
        summary,
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result?.data?.map((item) => ({
            ...item,
            ...{ raw_data: undefined },
            order_item: item.order_item.map((i) => ({
                ...i,
                is_low_price_order: some(lowPriceOrders, { id: `${i.id}` }),
            })),
        })),
        system_time: new Date(),
    }
}

exports.getOrderDetail = async (id, options = {}) => {
    const selectArr = [
        'o.*',
        getBasicStore(),
        getBasicSup(),
        getBasicWarehousing(),
        getBasicLocation(),
        // knex.raw('json_agg("oi".*) as order_items'),
        knex.raw(
            `ARRAY(SELECT row_to_json(oi.*)
            FROM order_item as oi
            LEFT JOIN product as p ON oi.product_id = p.id
            WHERE order_id = o.id AND ${options.product_source_ids
                ? `p.product_source_id IN (${options.product_source_ids})`
                : 'p.id = oi.product_id'
            }
            ) AS order_items`
        ),
    ]

    let query = knex
        .select(selectArr)
        .first()
        .from('order as o')
        .leftJoin('store', 'o.store_id', 'store.id')
        .leftJoin('supplier as s', 'o.supplier_id', 's.id')
        .leftJoin(
            'supplier_warehousing as sw',
            'o.supplier_warehousing_id',
            'sw.id'
        )
        .leftJoin('location as from', 'sw.location_id', 'from.id')
        .leftJoin('order_item as oi', 'o.id', 'oi.order_id')

    const condition = {}
    if (options?.partner_id && !options.product_source_ids) {
        condition['o.partner_id'] = options.partner_id
    }
    // if (options.supplier_id) {
    //     condition['sw.supplier_id'] = options.supplier_id
    // }

    query = query.where({
        'o.is_deleted': false,
        'o.id': id,
        // ...condition,
    })

    query = query.groupBy('o.id', 'store.id', 's.id', 'sw.id', 'from.id')

    const result = await query
    if (!result) throw new Error('order_not_found')

    if (result.order_items.length > 0 && !result.order_items[0])
        result.order_items = []
    const lowPriceOrders = (
        await knex.raw(`SELECT * from find_order_low_price('${id}')`)
    ).rows

    const allItems = result.order_items.map(async (item) => {
        let dataPrmotion
        let finalPrice
        if (result.fulfillment_status === 'pending') {
            dataPrmotion = await exports.getPromotionAndOrderSeller(id, item.id)
        } else {
            dataPrmotion = await exports.getPromotionAndOrder(id, item.id)
        }

        if (!isEmpty(dataPrmotion))
            if (dataPrmotion.prtType === 'product_by') {
                finalPrice = PromotionCtl.disCountFormula(
                    item.origin_supplier_price,
                    dataPrmotion?.value,
                    1,
                    !!(dataPrmotion?.type === 'percent')
                )
                dataPrmotion = {
                    ...dataPrmotion,
                    finalPrice: finalPrice || 0,
                }
            }
        item.promotion = dataPrmotion || {}

        return { ...item }
    })
    result.order_items = await Promise.all(allItems)

    return { ...result }
}
exports.countOrder = (partner_id) =>
    knex
        .first()
        .count('id')
        .from('order')
        .where({ partner_id, platform: 'lazada' || 'shoppe' })

exports.countOrderTodayForStore = async (options) => {
    const query =
        await knex.raw(`select fulfillment_status, count(id) AS "count_order" from "order"
        WHERE partner_id = ${options.partner_id}
            AND is_deleted = false
            AND
                DATE_PART('day', created_at) = date_part('day', CURRENT_DATE)
            AND
                DATE_PART('month', created_at) = date_part('month', CURRENT_DATE)
            AND
                DATE_PART('year', created_at) = date_part('year', CURRENT_DATE)
            GROUP BY fulfillment_status`)

    const data = query.rows

    return data
}
exports.countOrderItemByQuantity = async (whereCondition) => {
    console.log(
        '🚀 ~ file: order.js ~ line 281 ~ exports.countOrderItemByQuantity= ~ whereCondition',
        whereCondition
    )
    const query = knex
        .select([
            knex.raw(`sum(quantity)                           AS quantity`),
        ])
        .from('order_item')
        .where('order_id', whereCondition.order_id)
        .groupBy('order_id')

    const result = await query

    return result
}

exports.getPromotionAndOrder = async (orderId, orderItemId) => {
    let query = knex
        .select('pp.*', 'pt.type as prtType')
        .from('order_item as oi')
        .first()
        .leftJoin('order as o', 'o.id', 'oi.order_id')
        .joinRaw(
            `LEFT JOIN promotion_product as pp ON oi.product_variation_id = pp.variation_id AND pp.product_id = oi.product_id AND pp.promotion_id = oi.promotion_id`
        )
        .joinRaw(
            `LEFT JOIN promotion as pt ON pp.promotion_id = pt.id AND pt.from_time <= o.created_at AND pt.to_time >= o.created_at`
        )
        .where('oi.order_id', orderId)
        .andWhere({ 'pp.status': 'active' })
        .groupBy('pp.id', 'pt.id')

    if (orderItemId) {
        query = await query.andWhere('oi.id', orderItemId)
    }

    const result = await query

    return result
}

exports.getPromotionAndOrderSeller = async (orderId, orderItemId) => {
    let query = knex
        .select('pp.*', 'pt.type as prtType')
        .from('order_item as oi')
        .first()
        .leftJoin('order as o', 'o.id', 'oi.order_id')
        .joinRaw(
            `LEFT JOIN promotion_product as pp ON oi.product_variation_id = pp.variation_id AND pp.product_id = oi.product_id`
        )
        .joinRaw(
            `LEFT JOIN promotion as pt ON pp.promotion_id = pt.id AND pt.from_time <= o.created_at AND pt.to_time >= o.created_at`
        )
        .where('oi.order_id', orderId)
        .andWhere({ 'pp.status': 'active' })
        .andWhere({ 'pt.is_approve': true })
        .andWhere({ 'pt.status_validate': 'active' })
        .groupBy('pp.id', 'pt.id')

    if (orderItemId) {
        query = await query.andWhere('oi.id', orderItemId)
    }

    const result = await query

    return result
}

exports.incrementQrOrderItem = (condition, body, { trx } = {}) =>
    getKnex('order_item', trx).increment(body).where(condition)