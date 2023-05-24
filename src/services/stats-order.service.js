/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const _ = require('lodash')
const moment = require('moment-timezone')
const XLSX = require('xlsx')
const Order = require('../models/order')
const ProductVariation = require('../models/product-variation')
const Product = require('../models/product')
const { getBarcode, getImgUrl } = require('../utils/common.util')
const { knex, getKnex } = require('../connections/pg-general')
const {
    ORDER_STATUS,
    ORDER_PAYMENT_STATUS,
    ORDER_FULFILLMENT_STATUS,
    FILTER_TAB_STATUS_ARR,
    KEY_ORDER_STATUS,
    ODII_SELLER_PRODUCT_STATUS,
    ODII_ORDER_STATUS,
} = require('../constants/oms-status')
const {
    BOT_USER_ID,
    TRANSACTION_TYPE,
    TRANSACTION_ACTION,
    CURRENCY_CODE: { VND },
    STORE_PRODUCT_PUBLISH_STATUS,
} = require('../constants')
const TransactionService = require('./transaction.service')
const AuditLog = require('../models/audit-log')
const { arrayToMap } = require('../utils/common.util')
const AppError = require('../utils/app-error')

exports.sellerOrderStatsByDays = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            knex.raw(
                `DATE(o.created_at::timestamp AT time zone '${timezone}')        as date`
            ),
            knex.raw(`count(DISTINCT o.id)     as order_cnt`),
            knex.raw(
                `sum(o.total_items_price)                           AS revenue`
            ),
        ])
        .from('order as o')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)

    const condition = {
        'o.is_deleted': false,
        'o.is_map': true,
    }

    if (options.partner_id) condition['o.partner_id'] = options.partner_id
    if (options.tenant_id) condition['o.tenant_id'] = options.tenant_id

    if (whereCondition?.store_id) condition.store_id = whereCondition.store_id

    query.where(condition)

    if (whereCondition?.from_time) {
        query.andWhere('o.created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time)

    query.groupBy('date')

    const result = await query

    return result
}

exports.sellerOrderStatsOfProduct = async (options, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            pv.id,
            min(oi.thumb) as thumb,
            min(pr.name) as name,
            min(su.name) as supplier_name,
            min(pr.option_1) as option1_type,
            min(pv.option_1) as option1_value,
            min(pr.option_2) as option2_type,
            min(pv.option_2) as option2_value,
            min(pr.option_3) as option3_type,
            min(pv.option_3) as option3_value,
            sum(oi.quantity) as total_quantity,
            count(DISTINCT o.id) as total_buyer,
            sum(oi.retail_price * oi.quantity) as total_money,
            sum((oi.retail_price - oi.origin_supplier_price) * oi.quantity) as total_profit`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .innerJoin(
            'product_variation as pv',
            'oi.product_variation_id',
            'pv.id'
        )
        .innerJoin('product as pr', 'pv.product_id', 'pr.id')
        .innerJoin('supplier as su', 'pr.partner_id', 'su.partner_id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .andWhere('pr.is_deleted', false)
        .groupBy('pv.id')

    if (options.partner_id)
        query.andWhere('o.partner_id', '=', options.partner_id)
    if (options.tenant_id) {
        query.andWhere('o.tenant_id', options.tenant_id)
    } 
    if (whereCondition?.store_id)
        query.andWhere('o.store_id', '=', whereCondition.store_id)

    if (whereCondition?.from_time)
        query.andWhere('o.created_at', '>=', whereCondition.from_time)

    if (whereCondition?.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time)

    if (whereCondition?.keyword) {
        query.andWhere((builder) => {
            builder
                .where('pr.name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('su.name', 'ilike', `%${whereCondition.keyword}%`)

            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere('p.id', parseInt(whereCondition.keyword, 10))

            return builder
        })
    }
    // query
    //     .groupBy('oi.product_id', 'oi.quantity')
    //     .limit(5)
    //     .offset(0)
    //     .orderBy(orderBy, 'desc')

    const result = await query
        .orderBy(options.order_by || 'total_money', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}

exports.sellerOrderStatsByTime = async (options, whereCondition) => {
    let counterQuery = knex.first().count('id').from('order as o')

    let counterPro = knex
        .first()
        .count('p.id')
        .from('store_product as p')
        .innerJoin('store as s', 'p.store_id', 's.id')
        .where('s.is_deleted', false)

    const condition = {
        'o.is_deleted': false,
        is_map: true,
    }

    const conditionPro = {
        'p.is_deleted': false,
    }

    if (options.partner_id) {
        condition['o.partner_id'] = options.partner_id
        conditionPro['p.partner_id'] = options.partner_id
    }
    if (options.tenant_id) {
        condition['o.tenant_id'] = options.tenant_id
        conditionPro['p.tenant_id'] = options.tenant_id
    }

    const summaryOrder = {}
    for (let idx = 0; idx < FILTER_TAB_STATUS_ARR.length; idx += 1) {
        const status = FILTER_TAB_STATUS_ARR[idx]
        const cloneSummary = counterQuery.clone()
        if (status === 0) {
            delete condition['o.odii_status']
        } else {
            condition['o.odii_status'] = status
        }
        // eslint-disable-next-line no-await-in-loop
        const result = await cloneSummary.andWhere(condition)
        Object.assign(summaryOrder, {
            [KEY_ORDER_STATUS[status]]: result.count,
        })
    }

    const summaryPro = {}
    for (let idx = 0; idx < ODII_SELLER_PRODUCT_STATUS.length; idx += 1) {
        const status = idx
        const cloneSummary = counterPro.clone()
        if (status === 0) {
            delete conditionPro['p.odii_status_id']
        } else {
            conditionPro['p.odii_status_id'] = status - 1
        }
        const result = await cloneSummary.andWhere((builder) => {
            builder
                .andWhere(conditionPro)
                .whereIn('p.publish_status', [
                    STORE_PRODUCT_PUBLISH_STATUS.ACTIVE,
                    STORE_PRODUCT_PUBLISH_STATUS.DELETE,
                    STORE_PRODUCT_PUBLISH_STATUS.DEACTIVE,
                ])
            if (conditionPro['p.odii_status_id'] === 0) {
                delete conditionPro['p.odii_status_id']
                builder
                    .orWhereNull('p.odii_status_id')
                    .andWhere(conditionPro)
                    .whereIn('p.publish_status', [
                        STORE_PRODUCT_PUBLISH_STATUS.ACTIVE,
                        STORE_PRODUCT_PUBLISH_STATUS.DELETE,
                        STORE_PRODUCT_PUBLISH_STATUS.DEACTIVE,
                    ])
            }
        })
        Object.assign(summaryPro, {
            [ODII_SELLER_PRODUCT_STATUS[status]]: result.count,
        })
    }

    return Object.assign(summaryOrder, summaryPro)
}

const getPlatformChartData = async (options, fromTime, toTime) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt,
            sum(oi.retail_price * oi.quantity) as revenue,
            o.platform as platform`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .where('o.is_map', true)
        .where('o.is_deleted', false)
        .groupByRaw('o.platform')
    if (options.tenant_id) query.andWhere('o.tenant_id', options.tenant_id)
    if (options.partner_id) query.andWhere('o.partner_id', options.partner_id)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()

    const data = await query

    return data
}

const getSellerRevenueSummary = async (options, fromTime, toTime) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt,
            sum(oi.retail_price * oi.quantity) as revenue,
            sum((oi.retail_price - oi.origin_supplier_price) * oi.quantity) as profit`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .where('o.is_map', true)
        .where('o.is_deleted', false)
    if (options.tenant_id) query.andWhere('o.tenant_id', options.tenant_id)
    if (options.partner_id) query.andWhere('o.partner_id', options.partner_id)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()

    const data = await query

    return data[0]
}

const getSellerOrderCancel = async (options, fromTime, toTime) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt`)
        )
        .from('order as o')
        .where('o.odii_status', ODII_ORDER_STATUS.CANCELED)
        .where('o.is_map', true)
        .where('o.is_deleted', false)
    if (options.tenant_id) query.andWhere('o.tenant_id', options.tenant_id)
    if (options.partner_id) query.andWhere('o.partner_id', options.partner_id)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()

    const data = await query

    return data[0].order_cnt
}

exports.sellerGetReportRevenue = async (options, whereCondition) => {
    const currentPlatformData = await getPlatformChartData(
        options,
        whereCondition.from_time,
        whereCondition.to_time
    )

    const currentRevenueData = await getSellerRevenueSummary(
        options,
        whereCondition.from_time,
        whereCondition.to_time
    )

    const orderCancelCnt = await getSellerOrderCancel(
        options,
        whereCondition.from_time,
        whereCondition.to_time
    )

    const currentSummaryData = {
        revenue: currentRevenueData.revenue * 1,
        profit: currentRevenueData.profit * 1,
        order_cnt: currentRevenueData.order_cnt * 1,
        cancel_order_cnt: orderCancelCnt * 1,
        avrg_order_revenue:
            currentRevenueData.order_cnt > 0
                ? currentRevenueData.revenue / currentRevenueData.order_cnt
                : 0,
    }

    const summary = moment(whereCondition?.to_time).diff(
        moment(whereCondition?.from_time),
        'days'
    )

    const preRevenueData = await getSellerRevenueSummary(
        options,
        new Date(
            moment(whereCondition?.from_time).add(-summary, 'day')
        ).toISOString(),
        new Date(moment(whereCondition?.from_time).add(-1, 'day')).toISOString()
    )

    const preorderCancelCnt = await getSellerOrderCancel(
        options,
        new Date(
            moment(whereCondition?.from_time).add(-summary, 'days')
        ).toISOString(),
        new Date(moment(whereCondition?.from_time).add(-1, 'day')).toISOString()
    )

    const preSummaryData = {
        revenue:
            !preRevenueData.revenue && currentRevenueData.revenue
                ? 100
                : ((currentRevenueData.revenue - preRevenueData.revenue) /
                    preRevenueData.revenue) *
                100,
        profit:
            !preRevenueData.profit && currentRevenueData.profit
                ? 100
                : ((currentRevenueData.profit - preRevenueData.profit) /
                    preRevenueData.profit) *
                100,
        order_cnt:
            preRevenueData.order_cnt == 0 && currentRevenueData.order_cnt > 0
                ? 100
                : ((currentRevenueData.order_cnt - preRevenueData.order_cnt) /
                    preRevenueData.order_cnt) *
                100,
        cancel_order_cnt:
            preorderCancelCnt == 0 && orderCancelCnt > 0
                ? 100
                : ((orderCancelCnt - preorderCancelCnt) / preorderCancelCnt) *
                100,
        avrg_order_revenue:
            currentRevenueData.order_cnt == 0 && preRevenueData.order_cnt > 0
                ? -100
                : preRevenueData.order_cnt == 0 &&
                    currentRevenueData.order_cnt > 0
                    ? 100
                    : ((currentRevenueData.revenue / currentRevenueData.order_cnt -
                        preRevenueData.revenue / preRevenueData.order_cnt) /
                        (preRevenueData.revenue / preRevenueData.order_cnt)) *
                    100,
    }

    return {
        data_platform: currentPlatformData,
        current_summary: currentSummaryData,
        prevent_summary: preSummaryData,
    }
}

exports.sellerGetReportOrderCancel = async (options, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cancel,
            o.cancel_reason as cancel_reason,
            o.platform`)
        )
        .from('order as o')
        .where('o.odii_status', ODII_ORDER_STATUS.CANCELED)
        .andWhere('o.is_map', true)
        .andWhere('o.is_deleted', false)
        .groupBy('o.cancel_reason', 'o.platform')
    if (options.tenant_id)
        query.andWhere('o.tenant_id', '=', options.tenant_id)
    if (options.partner_id)
        query.andWhere('o.partner_id', '=', options.partner_id)
    if (whereCondition.platform)
        query.andWhere('o.platform', '=', whereCondition.platform)
    if (whereCondition.from_time)
        query.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time) // new Date().toISOString()

    const result = await query
        .orderBy(options.order_by || 'order_cancel', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data_deny: result.data,
    }
}

exports.sellerGetReportRevenueSupplier = async (options, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            su.id,
            min(su.name) as supplier_name,
            u.avatar,
            count(DISTINCT o.id) as total_quantity,
            sum(oi.retail_price * oi.quantity) as total_money`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .innerJoin(
            'product_variation as pv',
            'oi.product_variation_id',
            'pv.id'
        )
        .innerJoin('product as pr', 'pv.product_id', 'pr.id')
        .innerJoin('supplier as su', 'pr.partner_id', 'su.partner_id')
        .innerJoin('user as u', 'su.user_id', 'u.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .andWhere('pr.is_deleted', false)
        .groupBy('su.id', 'u.id')

    if (options.tenant_id)
        query.andWhere('o.tenant_id', '=', options.tenant_id)
    if (options.partner_id)
        query.andWhere('o.partner_id', '=', options.partner_id)
    if (whereCondition.from_time)
        query.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time)

    const result = await query
        .orderBy(options.order_by || 'total_money', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}

exports.sellerGetStatisticStatusProduct = async (options, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            count(1) as total,
            sum(case when odii_status_id = 1 then 1 else 0 end) as active,
            sum(case when (odii_status_id = 0 or odii_status_id is null) then 1 else 0 end) as deactive,
            st.platform
            `)
        )
        .from('store_product as st')
        .innerJoin('store as s', 'st.store_id', 's.id')
        .where('st.is_deleted', false)
        .andWhere('s.is_deleted', false)
        .groupBy('st.platform')
    
    if(options.tenant_id){
        query.andWhere('st.tenant_id', options.tenant_id)
    }

    if (options.partner_id)
        query
            .andWhere('st.partner_id', '=', options.partner_id)
            .whereIn('st.publish_status', [
                STORE_PRODUCT_PUBLISH_STATUS.ACTIVE,
                STORE_PRODUCT_PUBLISH_STATUS.DELETE,
                STORE_PRODUCT_PUBLISH_STATUS.DEACTIVE,
            ])

    const result = await query

    return {
        data: result,
    }
}

exports.sellerGetReportDenyProduct = async (options, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            st.id,
            st.name,
            st.thumb,
            st.updated_at,
            st.platform_status_name,
            st.platform_reject_reason,
            min(s.name) as name_store,
            min(s.platform) as platform
            `)
        )
        .from('store_product as st')
        .innerJoin('store as s', 's.id', 'st.store_id')
        .where('st.is_deleted', false)
        .andWhere('s.is_deleted', false)
        .andWhere((builder) => {
            builder.andWhere('st.odii_status_id', 0)
            builder.orWhereNull('st.odii_status_id')
        })
        .whereIn('st.publish_status', [
            STORE_PRODUCT_PUBLISH_STATUS.ACTIVE,
            STORE_PRODUCT_PUBLISH_STATUS.DELETE,
            STORE_PRODUCT_PUBLISH_STATUS.DEACTIVE,
        ])
        .groupBy('st.id')

    if (options.partner_id)
        query.andWhere('st.partner_id', '=', options.partner_id)
    if (options.tenant_id) {
        query.andWhere('st.tenant_id', '=', options.tenant_id)
    } 
    
    if (whereCondition?.keyword) {
        query.andWhere((builder) => {
            builder
                .where('st.name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('s.name', 'ilike', `%${whereCondition.keyword}%`)

            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere('st.id', parseInt(whereCondition.keyword, 10))

            return builder
        })
    }

    const result = await query
        .orderBy(options.order_by || 'st.updated_at', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data_deny: result.data,
    }
}
