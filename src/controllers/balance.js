const Joi = require('joi')
const _ = require('lodash')
const moment = require('moment-timezone')
const { isNull, method } = require('lodash')
const Balance = require('../models/balance')
const Bank = require('../models/bank')
const Transaction = require('../models/transaction')
const User = require('../models/user')
const { parseOption } = require('../utils/pagination')
const TransactionService = require('../services/transaction.service')
const TransactionStatsService = require('../services/stats-transaction.service')
const { pushMessage } = require('../services/onesignal.service')
const { ADMIN_URL } = require('../config')
const { importDataToZip } = require('../services/report')

const {
    getTransactionCode,
    getBarcode,
    getTransactionBankCode,
} = require('../utils/common.util')
const {
    TRANSACTION_METHOD,
    TRANSACTION_STATUS,
    TRANSACTION_TYPE,
    ACC_TYPE,
    STATUS,
    TRANSACTION_ACTION,
    TRANSACTION_FILTER,
} = require('../constants')
const { CONFIRM_STATUS } = require('../constants/oms-status')

const AuditLog = require('../models/audit-log')
const Order = require('../models/order')
const {
    getCurrentDebtPeriodTime,
    getNextPayoutPeriodTime,
    parseTimestampForQuery,
} = require('../utils/datetime.util')

exports.createBankTransfTransaction = async (request) => {
    const { user } = request

    const { amount, bank_id, type } = await Joi.object()
        .keys({
            amount: Joi.number().min(50000).required(),
            bank_id: Joi.number().required(),
            type: Joi.string()
                .valid(TRANSACTION_TYPE.DEPOSIT, TRANSACTION_TYPE.WITHDRAWAL)
                .only()
                .default(TRANSACTION_TYPE.DEPOSIT)
                .required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const userPrimaryBalance = await Balance.getPrimaryBalanceByPartner(
        user.partner_id
    )

    if (!userPrimaryBalance) throw new Error('balance_not_found')
    if (type === TRANSACTION_TYPE.WITHDRAWAL) {
        const bank_withdrawal = await Bank.getBank({
            id: bank_id,
            status: STATUS.ACTIVE,
            partner_id: user.partner_id,
            type: request.odii_source,
        })
        if (!bank_withdrawal) throw new Error('bank_not_belong_to_partner_id')
        if (Math.abs(amount) > userPrimaryBalance.amount)
            throw new Error(
                'withdrawal amount exceeds the amount in the wallet'
            )
    }
    if (type === TRANSACTION_TYPE.DEPOSIT) {
        const bank_deposit = await Bank.getBank({
            id: bank_id,
            status: STATUS.ACTIVE,
            type: ACC_TYPE.ADMIN,
        })
        if (!bank_deposit) throw new Error('bank_not_belong_to_Oddi')
    }

    const action_type =
        type === TRANSACTION_TYPE.DEPOSIT
            ? TRANSACTION_ACTION.DEPOSIT
            : TRANSACTION_ACTION.WITHDRAWAL

    const myAmount = (type === TRANSACTION_TYPE.DEPOSIT ? 1 : -1) * amount

    const transaction = {
        balance_id: userPrimaryBalance.id,
        balance_amount: userPrimaryBalance.amount,
        long_code: getTransactionCode(),
        short_code: getBarcode(),
        partner_id: user.partner_id,
        type,
        method: TRANSACTION_METHOD.BANK,
        amount: myAmount,
        bank_id,
        source: request.odii_source,
        action_type,
        status: TRANSACTION_STATUS.CREATE,
        tenant_id: user.tenant_id,
    }

    const [id] = await Transaction.insertTransaction(transaction)
    const newShortCode = getTransactionBankCode(id)
    await Transaction.updateTransactionById(id, {
        short_code: newShortCode,
    })

    if (id) {
        AuditLog.addTransactionLogAsync(id, {
            source: request.odii_source,
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.CREATE,
            metadata: {
                amount: transaction.amount,
                status: TRANSACTION_STATUS.CREATED,
            },
        })
    }

    return {
        is_success: true,
        data: {
            id,
            ...transaction,
            short_code: newShortCode,
        },
    }
}

exports.setTransactionPending = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const transaction = await Transaction.getTransaction({
        id,
        partner_id: user.partner_id,
    })

    if (!transaction) throw new Error('balance_id_not_found')

    const data = await Transaction.updateTransactionById(id, {
        status: TRANSACTION_STATUS.PENDING,
        confirm_status: TRANSACTION_STATUS.PENDING,
    })
    const is_success = data[0] !== 0

    if (is_success) {
        const options = {
            message: 'Gấp, có giao dịch cần xét duyệt',
            segment: 'Chief Accountant',
            url: `${ADMIN_URL}/transactions`,
        }
        pushMessage(options)

        AuditLog.addTransactionLogAsync(id, {
            source: request.odii_source,
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.UPDATE,
            metadata: {
                amount: transaction.amount,
                status: TRANSACTION_STATUS.PENDING,
            },
        })
    }

    return {
        is_success: true,
    }
}

exports.updateStatusPendingTransaction = async (request) => {
    const { id, status, note } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            status: Joi.string()
                .allow(TRANSACTION_STATUS.SUCCEEDED, TRANSACTION_STATUS.FAILED)
                .only()
                .required(),
            note: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const transactionData = await Transaction.getTransactionById(id, {
        status: TRANSACTION_STATUS.PENDING,
    })

    if (!transactionData) throw new Error('TRANSACTION_STATUS_NOT_PENDING')

    await TransactionService.confirmBankTransfer(transactionData.id, {
        status,
        note,
        source: request.odii_source,
        user_id: transactionData.from_user.id,
    })

    return {
        is_success: true,
    }
}
exports.sellerRemoveTransaction = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const transactionData = await Transaction.getTransaction({
        id,
        partner_id: user.partner_id,
        status: TRANSACTION_STATUS.CREATED,
        is_deleted: false,
    })

    if (!transactionData)
        throw new Error('transaction_status_not_created or not_found')
    await Transaction.updateTransaction(
        { id },
        {
            is_deleted: true,
        }
    )

    return {
        is_success: true,
    }
}
exports.adminGetTransactions = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            short_code: Joi.string(),
            long_code: Joi.string(),
            status: Joi.string().min(2).max(30),
            partner_id: Joi.string(),
            user_id: Joi.string(),
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            transaction_type: Joi.string()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
        })
        .validateAsync(_.omit(request.query, ['page', 'page_size']), {
            stripUnknown: false,
        })
    option.partner_id = query.partner_id
    option.user_id = query.user_id
    option.tenant_id = user.tenant_id
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

    const data = await Transaction.getTransactions(option, query)

    return {
        is_success: true,
        ...data,
    }
}

// seller
exports.getTransactions = async (request) => {
    const option = parseOption(request.query)
    const { timezone, from_date, to_date, confirm_status, ...query } =
        await Joi.object()
            .keys({
                keyword: Joi.string().min(2),
                from_date: Joi.string(),
                to_date: Joi.string(),
                timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
                transaction_type: Joi.string()
                    .allow(...Object.values(TRANSACTION_FILTER))
                    .only(),
                confirm_status: Joi.string(),
                action_type: Joi.string(),
            })
            .validateAsync(
                { ...request.query },
                { stripUnknown: false, allowUnknown: true }
            )
    const { user } = request
    option.partner_id = user.partner_id
    option.source = ACC_TYPE.SELLER
    option.tenant_id = user.tenant_id
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
    if (confirm_status === 'pending_all') {
        option.confirm_status_in = [
            CONFIRM_STATUS.PENDING,
            CONFIRM_STATUS.ACCOUNTANT_CONFIRMED,
            CONFIRM_STATUS.ACCOUNTANT_REJECTED,
        ]
    } else {
        option.confirm_status = confirm_status
    }

    const data = await Transaction.getTransactions(option, query)

    return {
        is_success: true,
        ...data,
    }
}

// supplier
exports.supplierGetTransactions = async (request) => {
    const option = parseOption(request.query)
    const {
        timezone,
        from_date,
        to_date,
        from_period_debt,
        to_period_debt,
        from_period_pay,
        to_period_pay,
        confirm_status,
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
            confirm_status: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const { user } = request
    option.partner_id = user.partner_id
    option.source = ACC_TYPE.SUP
    option.tenant_id = user.tenant_id

    if (from_date) query.from_time = parseTimestampForQuery(from_date, timezone)
    if (to_date) query.to_time = parseTimestampForQuery(to_date, timezone)

    // from_confirmed_at && options.to_confirmed_at
    // from_completed_at && options.to_completed_at
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

    if (confirm_status === 'pending_all') {
        option.confirm_status_in = [
            CONFIRM_STATUS.PENDING,
            CONFIRM_STATUS.ACCOUNTANT_CONFIRMED,
            CONFIRM_STATUS.ACCOUNTANT_REJECTED,
        ]
    } else {
        option.confirm_status = confirm_status
    }

    // console.log('option', option)

    const data = await Transaction.getTransactions(option, query)

    return {
        is_success: true,
        ...data,
    }
}

// Kế toán < Đây là transaction chuyển tới cho odii
exports.accoutingGetTransactions = async (request) => {
    const option = parseOption(request.query)
    const { user } = request
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
            partner_id: Joi.string(),
            transaction_type: Joi.string()
                .allow(...Object.values(TRANSACTION_FILTER))
                .only(),
            from_period_debt: Joi.string(),
            to_period_debt: Joi.string(),

            from_period_pay: Joi.string(),
            to_period_pay: Joi.string(),
            confirm_status: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    if (user.account_type !== ACC_TYPE.ADMIN) {
        option.partner_id = user.partner_id
    }

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

    // option.tenant_id = user.tenant_id

    const data = await Transaction.getTransactions(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getTransactionDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Transaction.getTransactionById(id)

    if (!isNull(data.bank_info)) {
        data.to_bank.bank_info = data.bank_info
        delete data.bank_info
    }

    if (!data) throw new Error('transaction_not_found')

    return {
        is_success: true,
        data,
    }
}

exports.getTransactionTimeLine = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { type: 'transaction' }

    const data = await AuditLog.getAuditLogByIdAndType(id, options)

    // if (_.isEmpty(data)) {
    //     throw new Error('transaction_id_has_not_information')
    // }

    return {
        is_success: true,
        data,
    }
}

exports.getPartnerDebtTimeLine = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { type: 'partner_debt' }

    const data = await AuditLog.getAuditLogByIdAndType(id, options)

    return {
        is_success: true,
        data,
    }
}

exports.adminGetBalanceDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Balance.getBalanceById(id)

    if (!data) throw new Error('balance_id_not_found')

    return {
        is_success: true,
        data,
    }
}

exports.adminGetBalancesByUser = async (request) => {
    const { user_id } = await Joi.object()
        .keys({
            user_id: Joi.string().required(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })

    const user = await User.getUserDetail(user_id)

    if (!user) throw new Error('user_not_found')

    const data = await Balance.getBalancesByPartnerId(user.partner_id)
    if (!data) throw new Error('balance_id_not_found')

    return {
        is_success: true,
        data,
    }
}

exports.getBalanceByUser = async (request) => {
    const { user } = request
    console.log('user.partner_id = ', user.partner_id)
    const data = await Balance.getPrimaryBalanceByPartner(user.partner_id)

    if (!data) throw new Error('NOT_FOUND')
    const withdrawalNearest = await Balance.getNearestTransactionByPartner(
        user.partner_id,
        'withdrawal'
    )
    const depositNearest = await Balance.getNearestTransactionByPartner(
        user.partner_id,
        'deposit'
    )

    return {
        is_success: true,
        data,
        nearest: {
            balance_withdrawal: withdrawalNearest,
            balance_deposit: depositNearest,
        },
    }
}


exports.supplierGetDebtBalance = async (request) => {
    const { user } = request

    const { timezone } = await Joi.object()
        .keys({
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })
    const currentDebtPeriod = getCurrentDebtPeriodTime(timezone)
    const currentPayoutPeriod = getNextPayoutPeriodTime(timezone)

    const [wait_for_pay, pending_for_pay] = await Promise.all([
        TransactionStatsService.getSumDebtBalance({
            partner_id: user.partner_id,
            debt_period_key: currentDebtPeriod.key,
        }),
        TransactionStatsService.getSumDebtBalance({
            partner_id: user.partner_id,
            payout_period_key: currentPayoutPeriod.key,
        }),
    ])

    return {
        is_success: true,
        data: {
            wait_for_confirmation: {
                start_date: currentDebtPeriod.startTime.format('YYYY-MM-DD'),
                end_date: currentDebtPeriod.endTime.format('YYYY-MM-DD'),
                key: currentDebtPeriod.key,
                ...wait_for_pay,
            },
            payout_on_progress: {
                start_date: currentPayoutPeriod.startTime.format('YYYY-MM-DD'),
                end_date: currentPayoutPeriod.endTime.format('YYYY-MM-DD'),
                key: currentPayoutPeriod.key,
                ...pending_for_pay,
            },
        },
    }
}

exports.adminGetDetailUserTransactions = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const user = await User.getUserDetail(id)

    if (!user) throw new Error('user_id_not_found')

    const option = parseOption(request.query)

    option.partner_id = user.partner_id

    const data = await Transaction.getTransactions(option, request.query)

    return {
        is_success: true,
        ...data,
    }
}

exports.supGetTransactionDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Transaction.getTransactionById(id)

    if (!data) throw new Error('transaction_not_found')

    if (data.order_id) {
        const result = await Order.countOrderItemByQuantity({
            order_id: data.order_id,
        })
        data.total_count = result[0].quantity || 0
    }

    return {
        is_success: true,
        data,
    }
}

exports.sellerExportListTransactionHistory = async (request, reply) => {
    const option = parseOption(request.query)
    const { timezone, from_date, to_date, confirm_status, ...query } =
        await Joi.object()
            .keys({
                keyword: Joi.string().min(2),
                from_date: Joi.string(),
                to_date: Joi.string(),
                timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
                transaction_type: Joi.string()
                    .allow(...Object.values(TRANSACTION_FILTER))
                    .only(),
                confirm_status: Joi.string(),
                action_type: Joi.string(),
            })
            .validateAsync(
                { ...request.query },
                { stripUnknown: false, allowUnknown: true }
            )
    const { user } = request
    option.partner_id = user.partner_id
    option.source = ACC_TYPE.SELLER
    option.paginate.perPage = null
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
    if (confirm_status === 'pending_all') {
        option.confirm_status_in = [
            CONFIRM_STATUS.PENDING,
            CONFIRM_STATUS.ACCOUNTANT_CONFIRMED,
            CONFIRM_STATUS.ACCOUNTANT_REJECTED,
        ]
    } else {
        option.confirm_status = confirm_status
    }

    const result = await Transaction.getTransactions(option, query)
    const newListTransactionHistory = result.data.map((item) => ({
        id: item.long_code || '',
        action_type:
            item.action_type == 'deposit'
                ? ' Nạp tiền'
                : item.action_type == 'affiliate_commission'
                ? 'Hoa hồng liên kết'
                : item.action_type == 'supplier_fulfill_fail'
                ? 'Hoàn tiền cung cấp'
                : item.action_type == 'seller_get_refund'
                ? 'Hoàn tiền đơn hàng'
                : item.action_type == 'confirmed_order'
                ? 'Thanh toán đơn hàng'
                : item.action_type == 'promotional_get_refund'
                ? 'Hoàn tiền khuyến mại'
                : item.action_type == 'withdrawal'
                ? 'Rút tiền'
                : '',
        amount: item.amount || '',
        balance_amount: item.balance_amount || '',
        method:
            item.method == 'debt'
                ? 'Công nợ'
                : item.method == 'bank'
                ? 'Chuyển khoản ngân hàng'
                : '',
        note: item.note || '',
        status:
            item.status == 'succeeded'
                ? 'Đã duyệt'
                : item.status == 'pending'
                ? 'Đang chờ'
                : (item.status = 'created' ? 'Khởi tạo' : 'Đã từ chối'),
    }))

    const headers = [
        [
            'Id',
            'Loại giao dịch',
            'Biến động',
            'Số dư',
            'Hình thức',
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
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(
        newListTransactionHistory,
        whereCondition
    )
    return reply.code(200).send(data)
}

exports.supplierExportListTransactionHistory = async (request, reply) => {
    const option = parseOption(request.query)
    const {
        timezone,
        from_date,
        to_date,
        from_period_debt,
        to_period_debt,
        from_period_pay,
        to_period_pay,
        confirm_status,
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
            confirm_status: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const { user } = request
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

    if (confirm_status === 'pending_all') {
        option.confirm_status_in = [
            CONFIRM_STATUS.PENDING,
            CONFIRM_STATUS.ACCOUNTANT_CONFIRMED,
            CONFIRM_STATUS.ACCOUNTANT_REJECTED,
        ]
    } else {
        option.confirm_status = confirm_status
    }
    const result = await Transaction.getTransactions(option, query)

    const newListTransactionHistory = result.data.map((item) => ({
        id: item.long_code || '',
        action_type:
            item.action_type == 'deposit'
                ? ' Nạp tiền'
                : item.action_type == 'affiliate_commission'
                ? 'Hoa hồng liên kết'
                : item.action_type == 'supplier_fulfill_fail'
                ? 'Hoàn tiền cung cấp'
                : item.action_type == 'seller_get_refund'
                ? 'Hoàn tiền đơn hàng'
                : item.action_type == 'confirmed_order'
                ? 'Thanh toán đơn hàng'
                : item.action_type == 'withdrawal'
                ? 'Rút tiền'
                : '',
        amount: item.amount || '',
        balance_amount: item.balance_amount || '',
        method:
            item.method == 'debt'
                ? 'Công nợ'
                : item.method == 'bank'
                ? 'Chuyển khoản ngân hàng'
                : '',
        note: item.note || '',
        status:
            item.status == 'succeeded'
                ? 'Đã duyệt'
                : item.status == 'pending'
                ? 'Đang chờ'
                : (item.status = 'created' ? 'Khởi tạo' : 'Đã từ chối'),
    }))

    const headers = [
        [
            'Id',
            'Loại giao dịch',
            'Biến động',
            'Số dư',
            'Hình thức',
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
        { width: 50 },
    ]
    const whereCondition = {
        headers,
        wscols,
    }

    const data = await importDataToZip(
        newListTransactionHistory,
        whereCondition
    )
    return reply.code(200).send(data)
}
