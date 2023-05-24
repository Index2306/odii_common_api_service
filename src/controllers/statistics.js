const Joi = require('joi')
const moment = require('moment-timezone')
const { REDIS_KEY, TRANSACTION_FILTER } = require('../constants')
const {
    getDataByType,
    infoSeller,
    infoNewOrder,
    infoSupplierToday,
} = require('../services/statistics')
const {
    FIELD_REPORT_PRODUCT,
    FIELD_REPORT_TRANSACTION,
} = require('../constants/fields-report')

const Product = require('../models/product')
const Supplier = require('../models/supplier')
const AppError = require('../utils/app-error')
const { ACC_TYPE } = require('../constants')
const { parseOption } = require('../utils/pagination')
const { arrayToMap, getDates } = require('../utils/common.util')
const TransactionStatsService = require('../services/stats-transaction.service')
const ProductStatsService = require('../services/stats-product.service')

const { redisClient } = require('../connections/redis-cache')

exports.adminGetStatistics = async (request) => {
    const { name } = request.query
    const statsData = await redisClient.getObject(`${REDIS_KEY.STATS}${name}`)
    if (statsData)
        return {
            is_success: true,
            data: statsData,
        }
    const newStatsData = await getDataByType(name)

    redisClient.setObjectEx(`${REDIS_KEY.STATS}${name}`, 36000, newStatsData)

    return {
        is_success: true,
        data: newStatsData,
    }
}

exports.sellerGetStatistics = async (request) => {
    const { user } = request

    const options = {}

    if (!user.account_type !== ACC_TYPE.SELLER)
        throw new Error('user is not a seller')

    const statsData = await redisClient.getObject(
        `${REDIS_KEY.STATS_SELLER}-${user.partner_id}`
    )
    if (statsData)
        return {
            is_success: true,
            data: statsData,
        }

    const newStatsData = await infoSeller(user.partner_id, options)

    redisClient.setObjectEx(
        `${REDIS_KEY.STATS_SELLER}${user.partner_id}`,
        1800,
        newStatsData
    )

    return {
        is_success: true,
        data: newStatsData,
    }
}
exports.supplierGetStatistics = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}

    option.partner_id = user.partner_id
    query.from_time = moment(from_date, 'YYYY-MM-DD')
        .tz(timezone)
        .startOf('day')
        .utc()
        .toISOString()

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()

    const newStatsData = await Product.countInfoProductByPartnerId(
        option,
        query,
        timezone
    )

    const statsMap = arrayToMap(newStatsData, 'publish_status')
    console.log('statsMap = ', statsMap)

    const getByKey = (key, isAbs = false) =>
        isAbs
            ? Math.abs(statsMap.get(key)?.count ?? 0 * 1)
            : statsMap.get(key)?.count ?? 0 * 1

    const total_inactive = getByKey('inactive')
    const total_active = getByKey('active')

    const total_product = getByKey('inactive', true) + getByKey('active', true)

    const data = {
        total_product_inactive: Math.abs(total_inactive),
        total_product_active: Math.abs(total_active),
        total_product_pending: 0,
        total_product_rejected: 0,
        total_product,
    }

    return {
        is_success: true,
        data,
    }

    // const data = {}

    // result.map((item) => {
    //     if (item.publish_status === 'inactive') {
    //         data.product_inactive = item.count
    //     }
    //     if (item.publish_status === 'active') {
    //         data.product_active = item.count
    //     }
    // })
    // const sum = result.reduce(
    //     (total, currentValue) => total + parseInt(currentValue.count, 10),
    //     0
    // )

    // data.count_total_product = sum

    // redisClient.setObjectEx(
    //     `${REDIS_KEY.STATS_SUPPLIER}${user.partner_id}`,
    //     1800,
    //     data
    // )

    // return {
    //     is_success: true,
    //     data,
    // }
}
exports.getFieldsInfo = async (request) => {
    const query = await Joi.object()
        .keys({
            type: Joi.string().required(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    let result
    // eslint-disable-next-line default-case
    switch (query.type) {
        case 'product':
            result = FIELD_REPORT_PRODUCT
            break
        case 'transaction':
            result = FIELD_REPORT_TRANSACTION
            break
    }

    return {
        is_success: true,
        data: Object.values(result),
    }
}

exports.sellerGetStatisticNewOrder = async (request) => {
    const { user } = request

    const option = {}
    option.partner_id = user.partner_id

    const statsData = await redisClient.getObject(
        `${REDIS_KEY.STATS_SELLER_ORDER}-${user.partner_id}`
    )
    if (statsData)
        return {
            is_success: true,
            data: statsData,
        }
    const newStatsData = await infoNewOrder(option)

    redisClient.setObjectEx(
        `${REDIS_KEY.STATS_SELLER_ORDER}${user.partner_id}`,
        1800,
        newStatsData
    )

    return {
        is_success: true,
        data: newStatsData,
    }
}

exports.adminGetTransactionStatsByDays = async (request) => {
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            // partner_id: Joi.string(),
            store_id: Joi.string(),
            partner_id: Joi.string(),
            transaction_type: Joi.string()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}

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

    const result = await TransactionStatsService.transactionStatsByDays(
        option,
        query,
        timezone
    )

    const listDates = getDates(from_date, to_date, timezone)
    if (listDates.length > 60) {
        throw new AppError('invalid_date_range', {
            message: 'Khoảng thời gian tối đa là 60 ngày',
        })
    }

    console.log('listDates = ', listDates)

    const data = result.map((item) => {
        item.local_date = moment
            .utc(item.date)
            .local()
            .tz(timezone)
            .format('YYYY-MM-DD')
        item.quantity *= 1
        item.amount *= 1

        return item
    })
    const mapResult = arrayToMap(data, 'local_date')
    console.log('mapResult = ', mapResult)

    return {
        is_success: true,
        data: listDates.map((item) => ({
            local_date: item,
            quantity: 0,
            amount: 0,
            ...mapResult.get(item),
        })),
    }
}

exports.sellerGetTransactionStatsByDays = async (request) => {
    const { user } = request

    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            store_id: Joi.string(),
            transaction_type: Joi.string()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}

    option.partner_id = user.partner_id

    option.source = ACC_TYPE.SELLER

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

    const result = await TransactionStatsService.transactionStatsByDays(
        option,
        query,
        timezone
    )

    const listDates = getDates(from_date, to_date, timezone)
    if (listDates.length > 60) {
        throw new AppError('invalid_date_range', {
            message: 'Khoảng thời gian tối đa là 60 ngày',
        })
    }

    console.log('listDates = ', listDates)

    const data = result.map((item) => {
        item.local_date = moment
            .utc(item.date)
            .local()
            .tz(timezone)
            .format('YYYY-MM-DD')
        item.quantity *= 1
        item.amount *= 1

        return item
    })
    const mapResult = arrayToMap(data, 'local_date')
    console.log('mapResult = ', mapResult)

    return {
        is_success: true,
        data: listDates.map((item) => ({
            local_date: item,
            quantity: 0,
            amount: 0,
            ...mapResult.get(item),
        })),
    }
}
exports.supplierGetProductStatsByDays = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

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

    const resutl = await ProductStatsService.productStatsByDays(
        option,
        query,
        timezone
    )

    const listDates = getDates(from_date, to_date, timezone)
    if (listDates.length > 60) {
        throw new AppError('invalid_date_range', {
            message: 'Khoảng thời gian tối đa là 60 ngày',
        })
    }

    console.log('listDates = ', listDates)

    const data = resutl.map((item) => {
        item.local_date = moment
            .utc(item.date)
            .local()
            .tz(timezone)
            .format('YYYY-MM-DD')
        item.quantity *= 1

        return item
    })
    const mapResult = arrayToMap(data, 'local_date')
    console.log('mapResult = ', mapResult)

    return {
        is_success: true,
        data: listDates.map((item) => ({
            local_date: item,
            quantity: 0,
            ...mapResult.get(item),
        })),
    }
}

exports.sellerGetDetailStatsSupplier = async (request) => {
    const {
        timezone,
        from_date,
        to_date,
        supplier_id,
        supplier_warehousing_id,
        ...query
    } = await Joi.object()
        .keys({
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            supplier_id: Joi.string().required(),
            supplier_warehousing_id: Joi.string(),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}

    option.supplier_id = supplier_id
    option.supplier_warehousing_id = supplier_warehousing_id

    query.from_time = moment(from_date, 'YYYY-MM-DD')
        .tz(timezone)
        .startOf('day')
        .utc()
        .toISOString()

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()

    // console.log('option', option)

    const result = await ProductStatsService.infoSupplierStatsByDays(
        option,
        query,
        timezone
    )
    const data = {}

    const sum = result.reduce(
        (total, currentValue) => total + parseInt(currentValue.quantity, 10),
        0
    )

    const rating = result.reduce(
        (total, currentValue) => {
            if (!currentValue.rating) {
                return total
            }

            return [total[0] + currentValue.rating, total[1] + 1]
        },
        [0, 0]
    )

    const number_vote = result.reduce(
        (total, currentValue) => total + currentValue.number_of_vote,
        0
    )
    data.countProduct = sum
    data.rating = (rating[0] / rating[1]).toFixed(2) || 4
    data.feedback = 0
    data.number_reviews = number_vote || 0

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetDetailStatsSupplierToday = async (request) => {
    const { supplier_id, supplier_warehousing_id, timezone, ...query } =
        await Joi.object()
            .keys({
                timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
                supplier_id: Joi.string().required(),
                supplier_warehousing_id: Joi.string(),
            })
            .validateAsync(request.query, {
                stripUnknown: false,
                allowUnknown: true,
            })

    const option = {}

    option.supplier_id = supplier_id
    option.supplier_warehousing_id = supplier_warehousing_id

    // console.log('option', option)

    const result = await infoSupplierToday(option, query)
    console.log(
        '🚀 ~ file: statistics.js ~ line 548 ~ exports.sellerGetDetailStatsSupplierToday= ~ infoSupplierToday',
        infoSupplierToday
    )

    return {
        is_success: true,
        data: result,
    }
}

exports.sellerGetDetailSupplierWareHousing = async (request) => {
    const option = parseOption(request.query)
    const { supplier_id, supplier_warehousing_id, timezone, ...query } =
        await Joi.object()
            .keys({
                timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
                supplier_id: Joi.string().required(),
                supplier_warehousing_id: Joi.string(),
            })
            .validateAsync(request.query, {
                stripUnknown: false,
                allowUnknown: true,
            })

    option.supplier_id = supplier_id

    const data = await Supplier.getInfoSuppliers(option, query)
    console.log(
        '🚀 ~ file: statistics.js ~ line 578 ~ exports.sellerGetDetailSupplierWareHousing= ~ data',
        data
    )

    data.count_supplier_warehousing = data.data.supplier_warehousing_data.length
    data.address = `${data.data.location_data?.address1 || ''}.${
        data.data.location_data?.ward_name || ''
    }.${data.data.location_data?.district_name || ''}.${
        data.data.location_data?.province || ''
    }`

    return {
        is_success: true,
        ...data,
    }
}
