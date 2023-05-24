const Joi = require('joi')
const moment = require('moment')
const affiliatePayoutService = require('../services/affiliate_payout.service')
const AffiliatePayoutPeriod = require('../models/affiliate_payout')
const { importDataToZip } = require('../services/report')
const { parseOption } = require('../utils/pagination')
const {
    getCurrPayoutAffiliate,
} = require('../services/partner-affiliate.service')
const {
    parseTimestampForQuery,
    parseIsoString,
} = require('../utils/datetime.util')
const { ACC_TYPE } = require('../constants')

exports.getCommissionListing = async (request) => {
    const { user } = request
    const partnerId = user.partner_id

    const paginator = parseOption(request.query)
    let { payout_affiliate_key, from_date, to_date, keyword } =
        await Joi.object()
            .keys({
                payout_affiliate_key: Joi.string().optional(),
                from_date: Joi.string().optional(),
                to_date: Joi.string().optional(),
                keyword: Joi.number().optional(),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )
    if (from_date) {
        from_date = parseIsoString(from_date)
    }
    if (to_date) {
        to_date = parseIsoString(to_date)
    }
    const data = await affiliatePayoutService.getCommissionListing(
        partnerId,
        payout_affiliate_key,
        from_date,
        to_date,
        keyword,
        paginator
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetListOder = async (request) => {
    const { user } = request
    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')
    const paginator = parseOption(request.query)
    let {
        payout_affiliate_key,
        partner_id,
        from_date,
        to_date,
        keyword,
        timezone,
        isPaid,
    } = await Joi.object()
        .keys({
            payout_affiliate_key: Joi.string().optional(),
            from_date: Joi.string().optional(),
            partner_id: Joi.string().optional(),
            to_date: Joi.string().optional(),
            keyword: Joi.number().optional(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            isPaid: Joi.boolean().optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    if (from_date) {
        from_date = parseTimestampForQuery(from_date, timezone)
    }
    if (to_date) {
        to_date = parseTimestampForQuery(to_date, timezone)
    }

    const data = await affiliatePayoutService.adminGetListOrders(
        partner_id,
        payout_affiliate_key,
        from_date,
        to_date,
        keyword,
        paginator,
        null
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetCommissionListing = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    let { partner_id, isPaid, payout_affiliate_key, order_by, keyword } =
        await Joi.object()
            .keys({
                payout_affiliate_key: Joi.string().optional(),
                partner_id: Joi.string(),
                isPaid: Joi.boolean(),
                order_by: Joi.string().optional(),
                keyword: Joi.string().min(2),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )
    const paginator = parseOption(request.query)
    const tenant_id = user?.tenant_id

    if (!payout_affiliate_key) {
        payout_affiliate_key = getCurrPayoutAffiliate().key
    }
    const data = await affiliatePayoutService.adminGetCommissionListing(
        partner_id,
        isPaid,
        payout_affiliate_key,
        paginator,
        order_by,
        keyword,
        tenant_id
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetStatisticalCommission = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    let { payout_affiliate_key } = await Joi.object()
        .keys({
            payout_affiliate_key: Joi.string().optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    if (!payout_affiliate_key) {
        payout_affiliate_key = getCurrPayoutAffiliate().key
    }

    const data = await affiliatePayoutService.adminGetCommissionByPeriods(
        payout_affiliate_key,
        user.tenant_id
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.getStatisticalCommission = async (request) => {
    const { user } = request

    const option = {
        partner_affiliate_id: user.partner_id,
    }

    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }

    const data = await affiliatePayoutService.getCommissionByPeriods(option)

    return {
        is_success: true,
        ...data,
    }
}

exports.adminUpdateCommission = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    const { id, payment_status, note } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            // isPaid: Joi.boolean().required(),
            payment_status: Joi.string()
                .allow('confirmed', 'rejected')
                .only()
                .required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    await affiliatePayoutService.adminUpdateCommission(
        user.id,
        id,
        payment_status,
        note
    )

    return {
        is_success: true,
    }
}

exports.adminGetDetailCommission = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const data = await affiliatePayoutService.adminGetDetailCommission(id)

    return {
        is_success: true,
        data,
    }
}

exports.adminExportAffPeriods = async (request, reply) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')

    let { partner_id, isPaid, payout_affiliate_key, order_by, keyword } =
        await Joi.object()
            .keys({
                payout_affiliate_key: Joi.string().optional(),
                partner_id: Joi.string(),
                isPaid: Joi.boolean(),
                order_by: Joi.string().optional(),
                keyword: Joi.string().min(2),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )
    const paginator = parseOption(request.query)

    if (!payout_affiliate_key) {
        payout_affiliate_key = getCurrPayoutAffiliate().key
    }
    const result = await affiliatePayoutService.adminGetCommissionListing(
        partner_id,
        isPaid,
        payout_affiliate_key,
        paginator,
        order_by
    )

    const newAffPeriods = result.data.map((item) => ({
        affiliate_period: item.payout_affiliate_key,
        name: item.from_user.full_name || '',
        email: item.from_user.email || '',
        created_at: moment(item.created_at).format('DD/MM/YYYY'),
        number: item.total_orders,
        commission: item.commission,
        status: item.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán',
    }))

    const headers = [
        [
            'Chu kì thanh toán',
            'Tên đối tác',
            'Email',
            'Ngày đăng kí',
            'Tổng số đơn hàng',
            'Hoa hồng thực nhân',
            'Trạng thái thanh toán',
        ],
    ]
    const wscols = [
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 50 },
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newAffPeriods, whereCondition)

    return reply.code(200).send(data)
}

exports.adminExportListCommissionOrder = async (request, reply) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')
    const paginator = parseOption(request.query)
    let {
        payout_affiliate_key,
        partner_id,
        from_date,
        to_date,
        keyword,
        timezone,
    } = await Joi.object()
        .keys({
            payout_affiliate_key: Joi.string().optional(),
            from_date: Joi.string().optional(),
            partner_id: Joi.string().optional(),
            to_date: Joi.string().optional(),
            keyword: Joi.number().optional(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )
    if (from_date) {
        from_date = parseTimestampForQuery(from_date, timezone)
    }
    if (to_date) {
        to_date = parseTimestampForQuery(to_date, timezone)
    }
    const result = await affiliatePayoutService.adminGetListOrders(
        partner_id,
        payout_affiliate_key,
        from_date,
        to_date,
        keyword,
        paginator
    )
    const newListCommissionOrders = result.data.map((item) => ({
        affiliate_period: item.payout_affiliate_key,
        name: item.from_user.full_name || '',
        email: item.from_user.email || '',
        created_at: moment(item.order_created_at).format('DD/MM/YYYY'),
        affiliate_commission_percent: item.affiliate_commission_percent,
        commission: item.commission,
        order_total_price: item.order_total_price,
        status: item.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán',
    }))

    const headers = [
        [
            'Chu kì thanh toán',
            'Tên đối tác',
            'Email',
            'Ngày tạo đơn',
            'Phần trăm hoa hồng',
            'Hoa hồng thực nhân',
            'Tổng tiền đơn hàng',
            'Trạng thái thanh toán',
        ],
    ]
    const wscols = [
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 50 },
        { width: 50 },
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newListCommissionOrders, whereCondition)

    return reply.code(200).send(data)
}

exports.sellerExportListCommission = async (request, reply) => {
    const { user } = request
    const partnerId = user.partner_id

    const paginator = parseOption(request.query)
    let { payout_affiliate_key, from_date, to_date, keyword } =
        await Joi.object()
            .keys({
                payout_affiliate_key: Joi.string().optional(),
                from_date: Joi.string().optional(),
                to_date: Joi.string().optional(),
                keyword: Joi.number().optional(),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )
    if (from_date) {
        from_date = parseIsoString(from_date)
    }
    if (to_date) {
        to_date = parseIsoString(to_date)
    }
    const result = await affiliatePayoutService.getCommissionListing(
        partnerId,
        payout_affiliate_key,
        from_date,
        to_date,
        keyword,
        paginator
    )

    const newListCommission = result.data.map((item) => ({
        user_id: item.user_id || '',
        shop_order_id: item.shop_order_id || '',
        order_created_at: item.order_created_at || '',
        created_at: item.created_at || '',
        order_total_price: item.order_total_price || 0,
        affiliate_commission_percent:
            `${item.affiliate_commission_percent} %` || '',
        commission: item.commission || 0,
        status:
            item.status === 'confirmed' ? 'Đã thanh toán' : 'Chờ thanh toán',
    }))

    const headers = [
        [
            'Id Seller',
            'Id đơn hàng',
            'Thời gian tạo đơn hàng',
            'Thời gian hoàn thành ĐH',
            'Giá trị đơn hàng',
            'Tỷ lệ hoa hồng',
            'Hoa hồng được nhận',
            'Trạng thái',
        ],
    ]

    const wscols = [
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 30 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newListCommission, whereCondition)

    return reply.code(200).send(data)
}
