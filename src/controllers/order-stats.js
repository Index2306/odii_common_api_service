/* eslint-disable vars-on-top */
const Joi = require('joi')
const moment = require('moment-timezone')
const _ = require('lodash')

const { ACC_TYPE } = require('../constants')
const { parseOption } = require('../utils/pagination')

const OrderStatsService = require('../services/stats-order.service')

const {
    arrayToMap,
    getDates,
    mapOderWithStatus,
} = require('../utils/common.util')
const AppError = require('../utils/app-error')

exports.sellerGetOrderStatsByDays = async (request) => {
    const { user } = request

    const { timezone, from_time, to_time, ...query } = await Joi.object()
        .keys({
            from_time: Joi.string().required(),
            to_time: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            // partner_id: Joi.string(),
            store_id: Joi.string().optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}
    option.partner_id = user.partner_id
    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }

    const resutl = await OrderStatsService.sellerOrderStatsByDays(
        option,
        query,
        timezone
    )

    const listDates = getDates(from_time, to_time, timezone)
    // if (listDates.length > 60) {
    //     throw new AppError('invalid_date_range', {
    //         message: 'Khoảng thời gian tối đa là 60 ngày',
    //     })
    // }

    const data = resutl.map((item) => {
        item.local_date = moment
            .utc(item.date)
            .local()
            .tz(timezone)
            .format('DD/MM')
        item.order_cnt *= 1
        item.revenue *= 1

        return item
    })

    const mapResult = arrayToMap(data, 'local_date')

    return {
        is_success: true,
        data_detail: listDates.map((item) => ({
            local_date: item,
            order_cnt: 0,
            revenue: 0,
            ...mapResult.get(item),
        })),
    }
}
exports.sellerGetReportRevenue = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().optional(),
            to_time: Joi.date().optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    const data = await OrderStatsService.sellerGetReportRevenue(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.sellerGetOrderStatsOfProduct = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.string().optional(),
            to_time: Joi.string().optional(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            keyword: Joi.string().min(2),
            // partner_id: Joi.string(),
            order_by: Joi.string(),
            store_id: Joi.string(),
            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    // const resutl = await OrderStatsService.sellerOrderStatsOfProduct(
    //     option,
    //     query
    // )

    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }

    const data = await OrderStatsService.sellerOrderStatsOfProduct(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetOrderStatsByTime = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const { ...query } = await Joi.object().validateAsync(request.query, {
        stripUnknown: false,
        allowUnknown: true,
    })
    if (user.account_type !== ACC_TYPE.SELLER)
        throw new Error('user_are_not_seller')

    option.partner_id = user.partner_id
    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }

    const data = await OrderStatsService.sellerOrderStatsByTime(option, query)

    return {
        is_success: true,
        data,
    }
}

exports.supplierGetOrderStatsByTime = async (request) => {
    const { user } = request

    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            supplier_id: Joi.string(),
            supplier_warehousing_id: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const option = {}
    option.partner_id = user.partner_id

    query.from_time = moment(from_date, 'YYYY-MM-DD')
        .tz(timezone)
        .startOf('day')
        .utc()
        .toISOString()
    if (!query.from_time) throw new Error('invalid__from_date')
    console.log('from_time = ', query.from_time)

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    if (!query.to_time) throw new Error('invalid__to_date')
    console.log('to_time = ', query.to_time)

    const data = await OrderStatsService.sellerOrderStatsByTime(
        option,
        query,
        timezone
    )

    return {
        is_success: true,
        data: mapOderWithStatus(data),
    }
}

exports.sellerGetReportOrderCancel = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().optional(),
            to_time: Joi.date().optional(),
            platform: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    const data = await OrderStatsService.sellerGetReportOrderCancel(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetReportRevenueSupplier = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object()
        .keys({
            from_time: Joi.date().optional(),
            to_time: Joi.date().optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    const data = await OrderStatsService.sellerGetReportRevenueSupplier(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetStatisticStatusProduct = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object().validateAsync(
        request.query,
        {
            stripUnknown: false,
            allowUnknown: true,
        }
    )

    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    const data = await OrderStatsService.sellerGetStatisticStatusProduct(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetReportDenyProduct = async (request) => {
    const { user } = request

    const { timezone, ...query } = await Joi.object().validateAsync(
        request.query,
        {
            stripUnknown: false,
            allowUnknown: true,
        }
    )

    const option = parseOption(request.query)

    option.partner_id = user.partner_id
    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }

    const data = await OrderStatsService.sellerGetReportDenyProduct(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}
