const Joi = require('joi')
const _ = require('lodash')
const moment = require('moment-timezone')
const Report = require('../models/report')
const Transaction = require('../models/transaction')
const { importDataToZip } = require('../services/report')
const { parseOption } = require('../utils/pagination')
const { parseTimestampForQuery } = require('../utils/datetime.util')
const { ACC_TYPE, TRANSACTION_FILTER } = require('../constants')
const { resetUserPassword } = require('../services/email')
const { formatVND, convertDebtDay } = require('../utils/common.util')
const DebtPeriod = require('../models/debt-period')
const { getCurrentDebtPeriodTime } = require('../utils/datetime.util')
const EmailService = require('../services/email')

exports.getReports = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Report.getReports(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createReport = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            name: Joi.string(),
            type: Joi.string(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.request_user_id = user.id
    value.partner_id = user.partner_id
    const data = await Report.insertReport(value)
    const success = data[0] !== 0

    return {
        success,
    }
}

exports.updateReport = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            type: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const isExistReport = await Report.getReportById(id)

    if (!isExistReport) {
        throw new Error('Report id not found')
    }

    const data = await Report.updateReportById(id, body)
    const success = data[0] !== 0

    return {
        success,
    }
}
exports.getReportDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Report.getReportById(id)

    if (!data) {
        throw new Error('Report id not found')
    }

    return {
        is_success: true,
        data,
    }
}
exports.deleteReport = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Report.getReportById(id)

    if (!data) {
        throw new Error('Report id not found')
    }

    await Report.deleteReportById(id)

    return {
        is_success: true,
    }
}
exports.createRequestToExportReport = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            type: Joi.string().required(),
            fields: Joi.array().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const data = await importDataToZip(value.type, value.fields)

    const report = {
        name: `${value.type}-report`,
        type: `${value.type}`,
        link: data.Location,
        request_user_id: user.id,
        partner_id: user.partner_id,
    }

    await Report.insertReport(report)

    return {
        ...report,
    }
}
exports.supplierExportReport = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const {
        timezone,
        from_date,
        to_date,
        from_period_debt,
        to_period_debt,
        from_period_pay,
        to_period_pay,
        ...query
    } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            method: Joi.string(),
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            transaction_type: Joi.string()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
            from_period_debt: Joi.string(),
            to_period_debt: Joi.string(),

            from_period_pay: Joi.string(),
            to_period_pay: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    option.partner_id = user.partner_id
    option.source = ACC_TYPE.SUP
    option.paginate.perPage = null
    if (from_date) query.from_time = parseTimestampForQuery(from_date, timezone)
    if (to_date) query.to_time = parseTimestampForQuery(to_date, timezone)

    if (from_period_debt)
        query.from_confirmed_at = parseTimestampForQuery(
            from_period_debt,
            timezone
        )
    if (to_period_debt)
        query.to_confirmed_at = parseTimestampForQuery(to_period_debt, timezone)

    if (from_period_pay)
        query.from_completed_at = parseTimestampForQuery(
            from_period_pay,
            timezone
        )
    if (to_period_pay)
        query.to_completed_at = parseTimestampForQuery(to_period_pay, timezone)

    const transactions = await Transaction.getTransactions(option, query)
    const newTrans = transactions.data.map((item) => {
        // eslint-disable-next-line no-unused-expressions
        item.method === 'debt' &&
        item.action_type === 'supplier_confirmed_order'
            ? (item.action_type = 'Chi phí CC')
            : (item.action_type = 'Doanh thu')

        // eslint-disable-next-line no-unused-expressions
        item.confirm_status === 'pending'
            ? (item.confirm_status = 'Đang chờ')
            : (item.confirm_status = 'Hệ thống đang xác nhận')

        return {
            created_at: moment(item.created_at).format('hh:mm DD/MM/YYYY'),
            long_code: item.long_code,
            action_type: item.action_type,
            order_code: item.order_code,
            amount: formatVND(item.amount),
            debt_period_key: convertDebtDay(item.debt_period_key),
            note: item.note || '',
            confirm_status: item.confirm_status,
        }
    })

    const headers = [
        [
            'Ngày giao dịch',
            'Mã giao dịch',
            'Loại giao dịch',
            'Đơn hàng',
            'Số tiền',
            'Chu kỳ công nợ',
            'Ghi chú giao dịch',
            'Trạng thái',
        ],
    ]
    const wscols = [
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 50 },
        { width: 80 },
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newTrans, whereCondition)

    return {
        is_success: true,
        data,
    }
}
exports.accountantExportDebt = async (request, reply) => {
    const { user } = request
    const option = parseOption(request.query)
    const { from_date, to_date, timezone, page, page_size, ...query } =
        await Joi.object()
            .keys({
                debt_period_key: Joi.string(),
                payout_period_key: Joi.string(),
                from_date: Joi.string(),
                to_date: Joi.string(),
                timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            })
            .validateAsync(
                { ...request.query, source: request.odii_source },
                { stripUnknown: false, allowUnknown: true }
            )

    if (from_date) query.from_time = parseTimestampForQuery(from_date, timezone)
    if (to_date) query.to_time = parseTimestampForQuery(to_date, timezone)

    option.max_debt_period_end = getCurrentDebtPeriodTime(timezone)
        .endTime.utc()
        .toISOString()

    if (option.page === 1) {
        // todo replace item 1st
    }
    option.paginate.perPage = null

    const debt = await DebtPeriod.getDebtPeriodListing(option, query)
    const newDebts = debt.data.map((item) => ({
        debt_period: `${moment(item.debt_period_start).format(
            'DD/MM/YYYY'
        )} - ${moment(item.debt_period_end).format('DD/MM/YYYY')}`,
        payout_period: `${moment(item.payout_period_start).format(
            'DD/MM/YYYY'
        )} - ${moment(item.payout_period_end).format('DD/MM/YYYY')}`,
        number_of_order: item.number_of_order,
        debt_amount: item.debt_amount,
        fee: item.total_fee,
        payout_amount: item.payout_amount,
    }))

    const headers = [
        [
            'Chu kì thanh toán',
            'Chu kì công nợ',
            'Tổng đơn hàng',
            'Tổng giá trị đơn hàng',
            'Phí',
            'Tổng thanh toán',
        ],
    ]
    const wscols = [
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newDebts, whereCondition)

    return reply.code(200).send(data)
}
exports.accountantExportTransaction = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            status: Joi.string().min(2).max(20),
            account_type: Joi.string(),
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            transaction_type: Joi.string()
                .required()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
        })
        .validateAsync(_.omit(request.query, ['page', 'page_size']), {
            stripUnknown: false,
        })
    if (from_date) {
        query.from_time = moment(from_date, 'YYYY-MM-DD')
            .tz(timezone)
            .startOf('day')
            .utc()
            .toISOString()
        console.log('from_time = ', query.from_time)
    }
    if (to_date) {
        query.to_time = moment(to_date, 'YYYY-MM-DD')
            .tz(timezone)
            .endOf('day')
            .utc()
            .toISOString()
        console.log('to_time = ', query.to_time)
    }
    option.paginate.perPage = null
    const transactions = await Transaction.getTransactions(option, query)

    const newTrans = transactions.data.map((item) => ({
        created_at: moment(item.created_at).format('hh:mm DD/MM/YYYY'),
        long_code: item.long_code,
        owner: item.from_user.email,
        account_type: item.source,
        type: item.type,
        method: item.method,
        amount: item.amount,
        note: item.note || '',
        status: item.status,
    }))

    const headers = [
        [
            'Ngày giao dịch',
            'Mã giao dịch',
            'Người thực hiện',
            'Loại tài khoản',
            'Loại giao dịch',
            'Hình thức',
            'Số tiền',
            'Nội dung',
            'Trạng thái',
        ],
    ]
    const wscols = [
        { width: 30 },
        { width: 30 },
        { width: 40 },
        { width: 40 },
        { width: 40 },
        { width: 50 },
        { width: 80 },
        { width: 50 },
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(newTrans, whereCondition)

    // await EmailService.requireExportData({
    //     email: user.email,
    //     link: data.Location,
    // })

    // const report = {
    //     name: `${user.email}-report`,
    //     type: `transaction`,
    //     link: data.Location,
    //     request_user_id: user.id,
    //     partner_id: user.partner_id,
    // }

    // await Report.insertReport(report)

    return {
        is_success: true,
        data,
    }
}
