const _ = require('lodash')
const moment = require('moment')
const { knex } = require('../connections/pg-general')
const {
    PRODUCT_STATUS_ARR,
    PRODUCT_STATUS_MAP,
    KEY_PRODUCT_STATUS,
    FILTER_TAB_STATUS_ARR,
    KEY_ORDER_STATUS,
    ODII_ORDER_STATUS,
} = require('../constants/oms-status')

exports.productStatsByDays = async (options, whereCondition, timezone) => {
    console.log(
        '🚀 ~ file: stats-product.service.js ~ line 32 ~ exports.productStatsByDays= ~ options',
        options
    )
    const query = knex
        .select([
            knex.raw(
                `DATE(created_at::timestamp AT time zone '${timezone}')        as date`
            ),
            knex.raw(
                `count(1)                                         AS quantity`
            ),
        ])
        .from('product')

    const condition = {
        is_deleted: false,
    }

    if (whereCondition.partner_id)
        condition.partner_id = whereCondition.partner_id

    if (options.partner_id) condition['product.partner_id'] = options.partner_id
    if (options.user_id) condition['product.by_user_id'] = options.user_id

    if (whereCondition?.status)
        condition['product.status'] = whereCondition.status

    query.where(condition)

    if (whereCondition?.from_time) {
        query.andWhere('created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('created_at', '<=', whereCondition.to_time)

    query.groupBy('date')

    const result = await query

    return result
}

exports.infoSupplierStatsByDays = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            'rating',
            'number_of_vote',
            knex.raw(
                `DATE(created_at::timestamp AT time zone '${timezone}')        as date`
            ),
            knex.raw(
                `count(1)                                         AS quantity`
            ),
        ])
        .from('product')

    const condition = {
        is_deleted: false,
    }
    if (options.supplier_id)
        condition['product.supplier_id'] = options.supplier_id
    if (options?.supplier_warehousing_id)
        condition['product.supplier_warehousing_id'] =
            options.supplier_warehousing_id

    if (whereCondition?.status)
        condition['product.status'] = whereCondition.status

    query.where(condition)

    if (whereCondition?.from_time) {
        query.andWhere('created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('created_at', '<=', whereCondition.to_time)

    query.groupBy('date', 'rating', 'number_of_vote')

    const result = await query

    return result
}

exports.supplierReportSoldProduct = async (options = {}, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            pv.id,
            min(oi.thumb) as thumb,
            min(pr.name) as name,
            min(sw.name) as supplier_warehousing,
            min(pr.option_1) as option1_type,
            min(pv.option_1) as option1_value,
            min(pr.option_2) as option2_type,
            min(pv.option_2) as option2_value,
            min(pr.option_3) as option3_type,
            min(pv.option_3) as option3_value,
            sum(oi.quantity) as total_quantity,
            count(DISTINCT o.id) as total_buyer,
            sum(oi.origin_supplier_price * oi.quantity) as total_money`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .innerJoin(
            'product_variation as pv',
            'oi.product_variation_id',
            'pv.id'
        )
        .innerJoin('product as pr', 'pv.product_id', 'pr.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'pr.supplier_warehousing_id',
            'sw.id'
        )
        .where('o.odii_status', 5)
        .andWhere('pr.is_deleted', false)
        .groupBy('pv.id')

    if (options.tenant_id) query.andWhere('o.tenant_id', options.tenant_id)

    if (whereCondition.supplier_id)
        query.andWhere('o.supplier_id', '=', whereCondition.supplier_id)
    if (whereCondition.keyword) {
        query.andWhere((builder) => {
            builder
                .where('pr.name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('sw.name', 'ilike', `%${whereCondition.keyword}%`)

            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere('p.id', parseInt(whereCondition.keyword, 10))

            return builder
        })
    }
    if (whereCondition?.from_time)
        query.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition?.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time)
    if (!_.isEmpty(whereCondition.category_id)) {
        if (_.isArray(whereCondition.category_id))
            query.whereRaw(
                `pr.product_categories_array \\?| array[${whereCondition.category_id
                    .map((item) => `'${item}'`)
                    .join(', ')}]`
            )
        else {
            query.andWhere((builder) => {
                builder.whereRaw(
                    `pr.product_categories_array \\?| array['${whereCondition.category_id}']`
                )
                if (!_.isEmpty(whereCondition.child_category_id)) {
                    if (_.isArray(whereCondition.child_category_id)) {
                        builder.whereRaw(
                            `pr.product_categories_array \\?| array[${whereCondition.child_category_id
                                .map((item) => `'${item}'`)
                                .join(', ')}]`
                        )
                    } else {
                        builder.whereRaw(
                            `pr.product_categories_array \\?| array['${whereCondition.child_category_id}']`
                        )
                    }
                }

                return builder
            })
        }
    }
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

exports.supplierReportLowQuantityProduct = async (
    options = {},
    whereCondition
) => {
    const query = knex
        .select([
            'pr.name',
            'pr.thumb',
            'sw.name as supplier_warehousing',
            'pr.option_1 as option1_type',
            'pv.option_1 as option1_value',
            'pr.option_2 as option2_type',
            'pv.option_2 as option2_value',
            'pr.option_3 as option3_type',
            'pv.option_3 as option3_value',
            'pv.total_quantity',
        ])
        .from('product_variation as pv')
        .innerJoin('product as pr', 'pv.product_id', 'pr.id')
        .innerJoin(
            'supplier_warehousing as sw',
            'pr.supplier_warehousing_id',
            'sw.id'
        )
        .where('pr.is_deleted', false)
        .andWhereRaw('pv.total_quantity <= pv.low_quantity_thres')

    if (options.tenant_id) query.andWhere('pr.tenant_id', options.tenant_id)

    if (whereCondition.supplier_id)
        query.andWhere('pr.supplier_id', '=', whereCondition.supplier_id)
    if (whereCondition.keyword) {
        query.andWhere((builder) => {
            builder
                .where('pr.name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('sw.name', 'ilike', `%${whereCondition.keyword}%`)

            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere('p.id', parseInt(whereCondition.keyword, 10))

            return builder
        })
    }

    if (!_.isEmpty(whereCondition.category_id)) {
        if (_.isArray(whereCondition.category_id))
            query.whereRaw(
                `pr.product_categories_array \\?| array[${whereCondition.category_id
                    .map((item) => `'${item}'`)
                    .join(', ')}]`
            )
        else {
            query.andWhere((builder) => {
                builder.whereRaw(
                    `pr.product_categories_array \\?| array['${whereCondition.category_id}']`
                )
                if (!_.isEmpty(whereCondition.child_category_id)) {
                    if (_.isArray(whereCondition.child_category_id)) {
                        builder.whereRaw(
                            `pr.product_categories_array \\?| array[${whereCondition.child_category_id
                                .map((item) => `'${item}'`)
                                .join(', ')}]`
                        )
                    } else {
                        builder.whereRaw(
                            `pr.product_categories_array \\?| array['${whereCondition.child_category_id}']`
                        )
                    }
                }

                return builder
            })
        }
    }
    const result = await query
        .orderBy(options.order_by || 'total_quantity', 'asc')
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

exports.supplierReportStatusWorkDashbroad = async (
    options = {},
    whereCondition
) => {
    const counterQuery = knex.first().count('p.id').from('product as p')

    const counterOrderQuery = knex.first().count('o.id').from('order as o')

    const condition = {
        'p.is_deleted': false,
    }
    const orderCondition = {
        'o.is_deleted': false,
        is_map: true,
    }
    if (options.partner_id) {
        condition['p.partner_id'] = options.partner_id
    }

    if (whereCondition.supplier_id) {
        orderCondition['o.supplier_id'] = whereCondition.supplier_id
    }

    if (options.tenant_id) {
        condition['p.tenant_id'] = options.tenant_id
        orderCondition['o.tenant_id'] = options.tenant_id
    }

    const summary = {}
    for (let indx = 0; indx < PRODUCT_STATUS_ARR.length; indx += 1) {
        const mapItem = PRODUCT_STATUS_MAP[PRODUCT_STATUS_ARR[indx]]
        if (mapItem) {
            if (mapItem.status) condition['p.status'] = mapItem.status
            else delete condition['p.status']
            if (mapItem.publish_status)
                condition['p.publish_status'] = mapItem.publish_status
            else delete condition['p.publish_status']
            const cloneSummary = counterQuery.clone()
            const resultCnt = await cloneSummary.andWhere(condition)
            Object.assign(summary, {
                [KEY_PRODUCT_STATUS[indx]]: resultCnt.count,
            })
        }
    }

    const orderTotal = {}
    for (let idx = 0; idx < FILTER_TAB_STATUS_ARR.length; idx += 1) {
        const status = FILTER_TAB_STATUS_ARR[idx]
        const cloneSummary = counterOrderQuery.clone()
        if (status === 0) {
            delete orderCondition['o.odii_status']
        } else {
            orderCondition['o.odii_status'] = status
        }
        delete orderCondition['o.fulfillment_status']
        // eslint-disable-next-line no-await-in-loop
        const resultOrder = await cloneSummary.andWhere(orderCondition)
        Object.assign(orderTotal, {
            [KEY_ORDER_STATUS[status]]: resultOrder.count,
        })
    }

    const counterInventoryQuery = knex
        .select(['pr.name', 'pv.total_quantity'])
        .from('product_variation as pv')
        .innerJoin('product as pr', 'pv.product_id', 'pr.id')
        .where('pr.is_deleted', false)

    if (whereCondition.supplier_id)
        counterInventoryQuery.andWhere(
            'pr.supplier_id',
            '=',
            whereCondition.supplier_id
        )

    if (options.tenant_id)
        counterInventoryQuery.andWhere('pr.tenant_id', '=', options.tenant_id)

    const inventoryTotal = {}
    const cloneInventory = counterInventoryQuery.clone()
    const resultInventory = await cloneInventory.andWhereRaw(
        'pv.total_quantity <= pv.low_quantity_thres'
    )
    Object.assign(inventoryTotal, {
        total_low_inventory: resultInventory.length,
    })

    return {
        data: Object.assign(summary, orderTotal, inventoryTotal),
    }
}
// tinh tong doanh thu, don hang
const getSupplierRevenueSummary = async (
    supplierId,
    fromTime,
    toTime,
    tenant_id
) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt,
            sum(oi.origin_supplier_price * oi.quantity) as revenue`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
    if (supplierId) query.andWhere('o.supplier_id', '=', supplierId)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()
    if (tenant_id) query.andWhere('o.tenant_id', tenant_id)

    const data = await query

    return data[0]
}
const getSupplierOrderCancel = async (
    supplierId,
    fromTime,
    toTime,
    tenant_id
) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt`)
        )
        .from('order as o')
        .where('o.odii_status', ODII_ORDER_STATUS.CANCELED)
    if (supplierId) query.andWhere('o.supplier_id', '=', supplierId)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()
    if (tenant_id) query.andWhere('o.tenant_id', tenant_id)

    const data = await query

    return data[0].order_cnt
}

const getDashboardChartData = async (
    supplierId,
    fromTime,
    toTime,
    tenant_id
) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt,
            sum(oi.origin_supplier_price * oi.quantity) as revenue,
            date(o.created_at) as created_at`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .groupByRaw('date(o.created_at)')
    if (supplierId) query.andWhere('o.supplier_id', '=', supplierId)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()
    if (tenant_id) query.andWhere('o.tenant_id', tenant_id)

    const data = await query

    return data
}

const getPlatformChartData = async (
    supplierId,
    fromTime,
    toTime,
    tenant_id
) => {
    const query = knex
        .select(
            knex.raw(`
            count(DISTINCT o.id) as order_cnt,
            sum(oi.origin_supplier_price * oi.quantity) as revenue,
            o.platform as platform`)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .groupByRaw('o.platform')
    if (supplierId) query.andWhere('o.supplier_id', '=', supplierId)
    if (fromTime) query.andWhere('o.created_at', '>=', fromTime) // new Date().toISOString()
    if (toTime) query.andWhere('o.created_at', '<=', toTime) // new Date().toISOString()
    if (tenant_id) query.andWhere('o.tenant_id', tenant_id)

    const data = await query

    return data
}

exports.supplierReportDashbroad = async (options = {}, whereCondition) => {
    const currentRevenueData = await getSupplierRevenueSummary(
        whereCondition.supplier_id,
        whereCondition.from_time,
        whereCondition.to_time,
        options.tenant_id
    )
    const orderCancelCnt = await getSupplierOrderCancel(
        whereCondition.supplier_id,
        whereCondition.from_time,
        whereCondition.to_time,
        options.tenant_id
    )
    const currentSummaryData = {
        revenue: currentRevenueData.revenue * 1,
        order_cnt: currentRevenueData.order_cnt * 1,
        cancel_order_cnt: orderCancelCnt * 1,
        avrg_order_revenue:
            currentRevenueData.order_cnt > 0
                ? currentRevenueData.revenue / currentRevenueData.order_cnt
                : 0,
    }

    const currentPlatformData = await getPlatformChartData(
        whereCondition.supplier_id,
        whereCondition.from_time,
        whereCondition.to_time,
        options.tenant_id
    )

    const chartData = await getDashboardChartData(
        whereCondition.supplier_id,
        whereCondition.from_time,
        whereCondition.to_time,
        options.tenant_id
    )

    const summary = []
    if (whereCondition?.to_time && whereCondition?.from_time) {
        const startTime = moment(whereCondition?.from_time)
        const endTime = moment(whereCondition?.to_time)
        for (
            let date = startTime;
            date.isSameOrBefore(endTime, 'day');
            date = date.add(1, 'day')
        ) {
            // Find revenue data
            const revenue = chartData.find((item) =>
                moment(item.created_at).isSame(date, 'day')
            )
            if (revenue) {
                summary.push({
                    order_cnt: revenue.order_cnt * 1,
                    revenue: revenue.revenue * 1,
                    time_slot: moment(date).format('DD/MM'),
                })
            } else {
                summary.push({
                    order_cnt: 0,
                    revenue: 0,
                    time_slot: moment(date).format('DD/MM'),
                })
            }
        }
    }

    const preRevenueData = await getSupplierRevenueSummary(
        whereCondition.supplier_id,
        new Date(
            moment(whereCondition?.from_time).add(-summary?.length, 'day')
        ).toISOString(),
        new Date(
            moment(whereCondition?.from_time).add(-1, 'day')
        ).toISOString(),
        options.tenant_id
    )

    const preorderCancelCnt = await getSupplierOrderCancel(
        whereCondition.supplier_id,
        new Date(
            moment(whereCondition?.from_time).add(-summary?.length, 'days')
        ).toISOString(),
        new Date(
            moment(whereCondition?.from_time).add(-1, 'day')
        ).toISOString(),
        options.tenant_id
    )

    const preSummaryData = {
        revenue:
            !preRevenueData.revenue && currentRevenueData.revenue
                ? 100
                : ((currentRevenueData.revenue - preRevenueData.revenue) /
                      preRevenueData.revenue) *
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
        data_detail: summary,
        data_platform: currentPlatformData,
        current_summary: currentSummaryData,
        prevent_summary: preSummaryData,
    }
}

exports.supplierTopSeller = async (options = {}, whereCondition) => {
    const query = knex
        .select(
            knex.raw(`
            u.id,
            u.full_name,
            u.avatar,
            count(DISTINCT o.id) as order_cnt,
            sum(oi.origin_supplier_price * oi.quantity) as revenue
            `)
        )
        .from('order as o')
        .innerJoin('order_item as oi', 'oi.order_id', 'o.id')
        .innerJoin('partner as p', 'p.id', 'o.partner_id')
        .innerJoin('user as u', 'u.id', 'p.user_id')
        .where('o.odii_status', ODII_ORDER_STATUS.DELIVERED)
        .where('u.is_deleted', false)
        .groupBy('u.id')

    if (options.tenant_id) query.andWhere('o.tenant_id', options.tenant_id)
    if (whereCondition.supplier_id)
        query.andWhere('o.supplier_id', '=', whereCondition.supplier_id)
    if (whereCondition.from_time)
        query.andWhere('o.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition.to_time)
        query.andWhere('o.created_at', '<=', whereCondition.to_time)
    if (whereCondition.keyword) {
        query.andWhere((builder) => {
            builder.where('u.full_name', 'ilike', `%${whereCondition.keyword}%`)

            return builder
        })
    }

    const result = await query
        .orderBy(options.order_by || 'revenue', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data_seller: result.data,
    }
}
