import Logger from '../logger'

const Joi = require('joi')
const moment = require('moment-timezone')
const _ = require('lodash')
const { isEmpty, sumBy } = require('lodash')
const {
    TRANSACTION_TYPE,
    TRANSACTION_FILTER,
    TRANSACTION_STATUS,
    TRANSACTION_METHOD,
} = require('../constants')
const { knex, useMyTrx } = require('../connections/pg-general')
const { CONFIRM_STATUS } = require('../constants/oms-status')

const { parseOption } = require('../utils/pagination')

const Transaction = require('../models/transaction')
const AppError = require('../utils/app-error')
const { arrayToMap, getDates } = require('../utils/common.util')
const TransactionStatsService = require('../services/stats-transaction.service')
const TransactionService = require('../services/transaction.service')
const AccountingStatsService = require('../services/stats-accounting.service')
const { mapTransactionWithStatus } = require('../utils/common.util')
const AuditLog = require('../models/audit-log')
const DebtPeriod = require('../models/debt-period')
const PartnerDebt = require('../models/partner-debt')
const Balance = require('../models/balance')
const DebtPeriodModel = require('../models/debt-period')
const { importDataToZip } = require('../services/report')

const {
    getCurrentDebtPeriodTime,
    getNextPayoutPeriodTime,
    parseTimestampForQuery,
    getListDebtPeriodTimeDesc,
    genPayoutPeriod,
} = require('../utils/datetime.util')
const { getTransactionCode, parseNumber } = require('../utils/common.util')

const DEPT_ACTION_LOG = {
    accountant_confirm: 'Kế toán viên',
    partner_confirm: 'Nhà cung cấp',
    chief_accountant_confirm: 'Kế toán trưởng',
}
exports.adminGetAccountingBalanceStats = async (request) => {
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
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

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    if (!query.to_time) throw new Error('invalid__to_date')

    const newStatsData = await AccountingStatsService.transactionStats(
        option,
        query,
        timezone
    )

    const statsMap = arrayToMap(newStatsData, 'action_type')
    console.log('statsMap = ', statsMap)

    const getByKey = (key, isAbs = false) =>
        isAbs
            ? Math.abs(statsMap.get(key)?.amount ?? 0 * 1)
            : statsMap.get(key)?.amount ?? 0 * 1

    const total_deposit =
        getByKey('seller_deposit') + getByKey('supplier_deposit')

    const total_withdrawal =
        getByKey('seller_withdrawal') + getByKey('supplier_withdrawal')

    const total_use =
        getByKey('seller_confirmed_order', true) +
        getByKey('supplier_confirmed_order', true) +
        getByKey('seller_get_refund', true) +
        getByKey('supplier_fulfill_fail', true)

    const data = {
        total_deposit,
        total_withdrawal: Math.abs(total_withdrawal),
        total_seller_deposit: getByKey('seller_deposit'),
        total_supplier_deposit: Math.abs(getByKey('supplier_deposit')),
        total_use,
    }

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetAccountingBalanceStats = async (request) => {
    const { user } = request
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string(),
            to_date: Joi.string(),
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

    const newStatsData = await AccountingStatsService.transactionStats(
        option,
        query,
        timezone
    )

    const statsMap = arrayToMap(newStatsData, 'action_type')
    console.log('statsMap = ', statsMap)

    const getByKey = (key, isAbs = false) =>
        isAbs
            ? Math.abs(statsMap.get(key)?.amount ?? 0 * 1)
            : statsMap.get(key)?.amount ?? 0 * 1

    const total_deposit = getByKey('seller_deposit')

    const total_withdrawal = getByKey('seller_withdrawal')

    const total_use =
        getByKey('seller_confirmed_order', true) +
        getByKey('seller_get_refund', true)

    const data = {
        total_deposit,
        total_withdrawal: Math.abs(total_withdrawal),
        total_use,
    }

    return {
        is_success: true,
        data,
    }
}

exports.adminGetAccountingBalanceHistory = async (request) => {
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
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

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    query.status = TRANSACTION_STATUS.SUCCEEDED
    const newStatsData = await AccountingStatsService.transactionHistoryStats(
        option,
        query,
        timezone
    )

    return {
        is_success: true,
        data: newStatsData,
    }
}
exports.adminGetAccountingBalanceCount = async (request) => {
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string(),
            to_date: Joi.string(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
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

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()

    query.status = TRANSACTION_STATUS.PENDING
    const newStatsData = await AccountingStatsService.transactionCount(
        option,
        query,
        timezone
    )

    const [countTotal, countInfo] = await Promise.all([
        Transaction.countTransaction({}),
        mapTransactionWithStatus(newStatsData),
    ])
    const total_transactions_pending =
        countInfo.request_transaction_deposit +
        countInfo.request_transaction_withdraw +
        countInfo.request_transaction_pay +
        countInfo.request_transaction_receive
    const data = {
        request_transaction_deposit: countInfo.request_transaction_deposit,
        request_transaction_withdraw: countInfo.request_transaction_withdraw,
        request_transaction_payment: countInfo.request_transaction_pay,
        request_transaction_receive: countInfo.request_transaction_receive,
        total_transactions: Number(countTotal.count),
        total_transactions_pending,
        total_transactions_succeeded:
            countTotal.count - total_transactions_pending,
    }

    return {
        is_success: true,
        data,
    }
}
exports.adminGetTransactionStatsByDays = async (request) => {
    const { timezone, from_date, to_date, ...query } = await Joi.object()
        .keys({
            from_date: Joi.string().required(),
            to_date: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            partner_id: Joi.string(),
            // acc_type: Joi.string().allow('seller', 'supplier').only(),
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

    query.to_time = moment(to_date, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    if (!query.to_time) throw new Error('invalid__to_date')
    query.status = TRANSACTION_FILTER.SUCCEEDED
    const result = await AccountingStatsService.transactionStatsByDays(
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
    const data = _.chain(result)
        .groupBy('date')
        .map((value, key) => ({
            local_date: moment
                .utc(key)
                .local()
                .tz(timezone)
                .format('YYYY-MM-DD'),
            transaction: value.reduce((obj, item) => {
                obj[item.type] = item.amount

                return obj
            }, {}),
        }))
        .value()
    const mapResult = arrayToMap(data, 'local_date')

    return {
        is_success: true,
        data: listDates.map((item) => ({
            local_date: item,
            transaction: {
                deposit: 0,
                withdrawal: 0,
            },
            ...mapResult.get(item),
        })),
    }
}
exports.accountantUpdateStatus = async (request) => {
    const { user } = request
    const { id, confirm_status, note } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            confirm_status: Joi.string()
                .allow(
                    CONFIRM_STATUS.ACCOUNTANT_CONFIRMED,
                    CONFIRM_STATUS.ACCOUNTANT_REJECTED
                )
                .only(),
            note: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const option = { confirm_status: CONFIRM_STATUS.PENDING }
    const transaction = await Transaction.getTransactionById(id, option)
    if (!transaction) throw new Error('transaction id not found or not pending')

    await Transaction.updateTransactionById(id, {
        confirm_status,
    })

    AuditLog.addTransactionLogAsync(id, {
        source: request.odii_source,
        user_id: user.id,
        note,
        action: AuditLog.ACTION_TYPE.UPDATE,
        metadata: {
            amount: transaction.amount,
            status: TRANSACTION_STATUS.UPDATE,
            confirm_status,
        },
    })

    return { is_success: true, id, confirm_status }
}

exports.chiefAccountantUpdateStatus = async (request) => {
    const { user } = request
    const { id, confirm_status, note } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            confirm_status: Joi.string()
                .allow(
                    CONFIRM_STATUS.CHIEF_ACCOUNTANT_CONFIRMED,
                    CONFIRM_STATUS.CHIEF_ACCOUNTANT_REJECTED
                )
                .only(),
            note: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const transaction = await Transaction.getTransactionById(id)
    if (!transaction) throw new Error('transaction id not found')

    if (
        confirm_status === CONFIRM_STATUS.CHIEF_ACCOUNTANT_CONFIRMED &&
        transaction.type === TRANSACTION_TYPE.WITHDRAWAL
    ) {
        const userPrimaryBalance = await Balance.getPrimaryBalanceByPartner(
            transaction.partner_id
        )
        if (!userPrimaryBalance) throw new Error('balance_not_found')
        if (Math.abs(transaction.amount) > userPrimaryBalance.amount) {
            throw new Error('excess_money')
        }
    }

    await Transaction.updateTransactionById(id, { confirm_status })

    await TransactionService.confirmBankTransfer(transaction.id, {
        status: confirm_status,
        note,
        source: request.odii_source,
        user_id: transaction.from_user.id,
    })

    return { is_success: true, id, confirm_status }
}

exports.overviewStats = async (request) => {
    const { user } = request
    const { timezone } = await Joi.object()
        .keys({
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })
    const currentDebt = await DebtPeriodModel.getCurrentDebtPeriod(timezone)
    if (!currentDebt) {
        return {
            is_success: false,
            data: 'Bảng đối soát chưa được khởi tạo',
        }
    }
    const prevTime = moment(currentDebt.debt_period_start).add(-1, 'days')
    const prevDebt = await DebtPeriodModel.getDebtPerioldByTime(prevTime)

    // const currentDebtPeriod = getCurrentDebtPeriodTime(timezone)
    // const currentPayoutPeriod = getNextPayoutPeriodTime(timezone)

    const [debtCurrentPeriod, debtPrevPeriod] = await Promise.all([
        DebtPeriod.getOne({
            key: currentDebt.key,
            tenant_id: user?.tenant_id,
        }),
        DebtPeriod.getOne({
            key: prevDebt.key,
            tenant_id: user?.tenant_id,
        }),
    ])

    return {
        is_success: true,
        data: {
            debt_current_period: {
                ...debtCurrentPeriod,
                start_date: currentDebt.debt_period_start,
                end_date: currentDebt.debt_period_end,
                key: currentDebt.key,
                amount: debtCurrentPeriod?.debt_amount || 0,
            },
            debt_prev_period: {
                ...debtPrevPeriod,
                start_date: prevDebt.debt_period_start,
                end_date: prevDebt.debt_period_end,
                key: prevDebt.key,
                amount: debtPrevPeriod?.debt_amount || 0,
            },
            payout_prev_period: {
                ...debtPrevPeriod,
                start_date: prevDebt.payout_period_start,
                end_date: prevDebt.payout_period_end,
                key: prevDebt.payout_period_key,
                amount: debtPrevPeriod?.payout_amount || 0,
            },
        },
    }
}

exports.overviewStatSupplier = async (request) => {
    const { user } = request
    const { timezone } = await Joi.object()
        .keys({
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })
    const partnerId = user.partner_id
    const currentDebt = await DebtPeriodModel.getPartnerCurrentDebtPeriod(
        timezone,
        partnerId,
        user.tenant_id
    )
    if (!currentDebt) {
        return {
            is_success: false,
            data: 'Bảng đối soát chưa được khởi tạo',
        }
    }
    const prevTime = moment(currentDebt.debt_period_start).add(-1, 'days')
    const prevDebt = await DebtPeriodModel.getPartnerDebtPerioldByTime(
        prevTime,
        partnerId,
        user.tenant_id
    )

    // const currentDebtPeriod = getCurrentDebtPeriodTime(timezone)
    // const currentPayoutPeriod = getNextPayoutPeriodTime(timezone)

    if (!prevDebt) {
        return {
            is_success: true,
            data: {
                debt_current_period: {
                    start_date: currentDebt.debt_period_start,
                    end_date: currentDebt.debt_period_end,
                    key: currentDebt.key,
                    amount: currentDebt.total_revenue,
                },
            },
        }
    }

    return {
        is_success: true,
        data: {
            debt_current_period: {
                start_date: currentDebt.debt_period_start,
                end_date: currentDebt.debt_period_end,
                key: currentDebt.key,
                amount: currentDebt.total_revenue,
            },
            debt_prev_period: {
                start_date: prevDebt.debt_period_start,
                end_date: prevDebt.debt_period_end,
                key: prevDebt.key,
                amount: prevDebt.total_revenue,
            },
            payout_prev_period: {
                start_date: prevDebt.payout_period_start,
                end_date: prevDebt.payout_period_end,
                key: prevDebt.payout_period_key,
                amount: prevDebt.payout_amount,
            },
        },
    }
}

exports.overviewStatSeller = async (request) => {
    const { user } = request
    const { timezone } = await Joi.object()
        .keys({
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync({ ...request.query }, { stripUnknown: true })
    const partnerId = user.partner_id
    const currentDebt = await DebtPeriodModel.getPartnerCurrentDebtPeriod(
        timezone,
        partnerId
    )
    if (!currentDebt) {
        return {
            is_success: false,
            data: 'Bảng đối soát chưa được khởi tạo',
        }
    }
    const prevTime = moment(currentDebt.debt_period_start).add(-1, 'days')
    const prevDebt = await DebtPeriodModel.getPartnerDebtPerioldByTime(
        prevTime,
        partnerId
    )

    if (!prevDebt) {
        return {
            is_success: true,
            data: {
                debt_current_period: {
                    start_date: currentDebt.debt_period_start,
                    end_date: currentDebt.debt_period_end,
                    key: currentDebt.key,
                    amount: currentDebt.total_revenue,
                },
            },
        }
    }

    return {
        is_success: true,
        data: {
            debt_current_period: {
                start_date: currentDebt.debt_period_start,
                end_date: currentDebt.debt_period_end,
                key: currentDebt.key,
                amount: currentDebt.total_revenue,
            },
            debt_prev_period: {
                start_date: prevDebt.debt_period_start,
                end_date: prevDebt.debt_period_end,
                key: prevDebt.key,
                amount: prevDebt.total_revenue,
            },
            payout_prev_period: {
                start_date: prevDebt.payout_period_start,
                end_date: prevDebt.payout_period_end,
                key: prevDebt.payout_period_key,
                amount: prevDebt.payout_amount,
            },
        },
    }
}

exports.getDebtByPeriod = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
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
    // console.log('option.max_debt_period_end = ', option.max_debt_period_end)

    option.max_debt_period_start = user.created_at

    if (option.page === 1) {
        // todo replace item 1st
    }

    const data = await DebtPeriod.getDebtPeriodListing(option, query)

    return { is_success: true, ...data }
}

exports.getDebtByPeriodSupplier = async (request) => {
    const { user } = request

    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
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
    query.partner_id = user.partner_id
    const data = await PartnerDebt.getListingV2(option, query)

    return { is_success: true, ...data }
}

exports.getDebtByPeriodSeller = async (request) => {
    const { user } = request

    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
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
    query.partner_id = user.partner_id
    const data = await PartnerDebt.getListingV2(option, query)

    return { is_success: true, ...data }
}

exports.getDebtByPeriodDetailEachUser = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    const { from_date, to_date, timezone, page, page_size, ...query } =
        await Joi.object()
            .keys({
                debt_period_key: Joi.string().required(),
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

    const data = await PartnerDebt.getListing(option, query)

    return { is_success: true, ...data }
}

exports.getDebtByPeriodOverview = async (request) => {
    const { user } = request
    const { from_date, to_date, timezone, page, page_size, ...query } =
        await Joi.object()
            .keys({
                debt_period_key: Joi.string().required(),
                payout_period_key: Joi.string(),
                partner_id: Joi.string(),
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

    const data = await PartnerDebt.getOverviewStats(query)

    return { is_success: true, data }
}

exports.getCountOrderByPeriod = async (request) => {
    const { user } = request
    const { from_date, to_date, timezone, page, page_size, ...query } =
        await Joi.object()
            .keys({
                debt_period_key: Joi.string().required(),
                payout_period_key: Joi.string(),
                partner_id: Joi.string(),
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

    const data = await TransactionStatsService.getSumDebtBalance(
        {
            is_order_transaction: true,
        },
        {
            ...query,
        }
    )

    return { is_success: true, data }
}

exports.getDebtPeriodTimeListing = async (request) => {
    const data = getListDebtPeriodTimeDesc(24)

    return { is_success: true, data }
}

exports.getCurrDebtPeriod = async (request) => {
    const { timezone } = await Joi.object()
        .keys({
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
        })
        .validateAsync(
            { ...request.query, source: request.odii_source },
            { stripUnknown: false, allowUnknown: true }
        )

    const currentDebtPeriod = getCurrentDebtPeriodTime(timezone)
    genPayoutPeriod(currentDebtPeriod)

    return { is_success: true, data: currentDebtPeriod }
}

exports.accountantCommentTransaction = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const transaction = await Transaction.getTransactionById(id)

    if (!transaction) throw new Error('transaction_not_found')

    AuditLog.addTransactionLogAsync(id, {
        user_id: user.id,
        action: AuditLog.ACTION_TYPE.COMMENT,
        source: request.odii_source,
        note: values.note,
        short_description: 'Kế toán tạo ghi chú',
    })

    return {
        is_success: true,
    }
}

exports.addNewTransaction = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number(),
            partner_id: Joi.number(),
            user_id: Joi.number(),
            debt_period_key: Joi.string(),
            amount: Joi.number(),
            created_at: Joi.string(),
            type: Joi.string(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.query, ...request.body },
            { stripUnknown: true }
        )
    const { order_code } = request.body
    const data = {
        by_user_id: values.user_id,
        partner_id: values.partner_id,
        debt_period_key: values.debt_period_key,
        amount: values?.amount,
        created_at: values.created_at,
        type: values?.type || 'withdrawal',
        note: values?.note || '',
        order_code: order_code || '',
        long_code: getTransactionCode(),
        source: 'supplier',
        action_type: 'admin_confirm_transaction',
        tenant_id: user.tenant_id,
    }

    const comfirmTransaction = await useMyTrx(null, async (trx) => {
        const [newTransaction] = await Transaction.insertTransaction(data, trx)
        const actionResult =
            await TransactionService.comfirmedAddNewTransaction(
                {
                    id: newTransaction,
                    debtPeriodKey: values.debt_period_key,
                    for_partner_id: values.partner_id,
                    type: values?.type,
                    tenant_id: user.tenant_id,
                },
                trx
            ).then((updateResult) => {
                if (_.isEmpty(updateResult)) {
                    return false
                }

                return true
            })
        if (!actionResult) {
            return false
        }
        AuditLog.addPartnerDebtLogAsync(
            id,
            {
                user_id: user.id,
                action: AuditLog.ACTION_TYPE.COMMENT,
                source: request.odii_source,
                note: values.note,
                short_description: `${user.full_name} Tạo giao dịch`,
            },
            {}
        )

        return newTransaction
    })

    return {
        data: {
            id: comfirmTransaction,
        },
        is_success: true,
    }
}

exports.accountantCommentDebt = async (request) => {
    const { user } = request
    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    const transaction = await Transaction.getTransactionById(id)

    // if (!transaction) throw new Error('transaction_not_found')

    AuditLog.addPartnerDebtLogAsync(
        id,
        {
            user_id: user.id,
            action: AuditLog.ACTION_TYPE.COMMENT,
            source: request.odii_source,
            note: values.note,
            short_description: `${user.full_name} tạo ghi chú`,
        },
        {}
    )

    return {
        is_success: true,
    }
}

exports.updatePartnerDebtProcess = async (request) => {
    const { user } = request
    let syncDebtPeriod = false
    const { id, action_type, is_accept, note } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            is_accept: Joi.boolean().required(),
            action_type: Joi.string()
                .allow(
                    'accountant_confirm',
                    'partner_confirm',
                    'chief_accountant_confirm'
                )
                .only(),
            note: Joi.string(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    console.log('id', id)
    const debt = await PartnerDebt.getOne({ id })
    if (isEmpty(debt)) {
        return {
            is_success: false,
            data: 'Không tìm thấy bảng đối soát',
        }
    }
    if (debt.chief_accountant_confirm === 'confirmed') {
        return {
            is_success: false,
            data: 'Bảng đối soát đã hoàn thành, không được thao tác',
        }
    }

    if (action_type === 'partner_confirm') {
        if (debt.accountant_confirm !== 'confirmed') {
            return {
                is_success: false,
                data: 'Kế toán viên chưa xác nhận, thao tác không hợp lệ',
            }
        }
    } else if (action_type === 'chief_accountant_confirm') {
        if (debt.partner_confirm !== 'confirmed') {
            return {
                is_success: false,
                data: 'Đối tác chưa xác nhận, thao tác không hợp lệ',
            }
        }
    }
    const payload = {}

    payload[action_type] = is_accept ? 'confirmed' : 'rejected'
    if (!is_accept) {
        if (
            action_type === 'partner_confirm' ||
            action_type === 'chief_accountant_confirm'
        )
            payload.accountant_confirm = 'reconfirm'
        if (action_type === 'chief_accountant_confirm') {
            payload.partner_confirm = 'reconfirm'
        }
    } else if (action_type == 'accountant_confirm') {
        payload.partner_confirm = 'pending'
        payload.chief_accountant_confirm = 'pending'
    }
    payload[`${action_type}_at`] = new Date().toISOString()
    payload[`${action_type}_by_user_id`] = user.id
    const shortDesc = is_accept
        ? `Bảng đối soát đã được ${DEPT_ACTION_LOG[action_type]} duyệt thành công`
        : `Bảng đối soát đã bị ${DEPT_ACTION_LOG[action_type]} từ chối`
    await knex.transaction(async (trx) => {
        const isApprove =
            action_type === 'chief_accountant_confirm' && is_accept
        if (isApprove) {
            payload.debt_status = 'confirmed'
            payload.payout_status = 'confirmed'
        }
        if (isApprove) {
            // Get all transaction belong to this partner in this period
            const transactions =
                await Transaction.getPartnerDebtTransactionReadyToComplete(
                    debt.partner_id,
                    debt.debt_period_key
                )
            const transIds = transactions.map((item) => item.id)
            console.log('updatePartnerDebtProcess transid', transIds)
            // Move money from odii to supplier wallet
            await TransactionService.confirmPartnerDebtTransfer(
                transIds,
                {
                    source: 'admin',
                    user_id: user.id,
                    partner_id: debt.partner_id,
                },
                trx
            )
            syncDebtPeriod = true
        }
        await PartnerDebt.updateById(id, payload, { trx })
        // insert to audit log
        AuditLog.addPartnerDebtLogAsync(
            id,
            {
                source: request.odii_source,
                user_id: user.id,
                note,
                action: AuditLog.ACTION_TYPE.UPDATE,
                short_description: shortDesc,
                metadata: { ...debt, ...payload },
            },
            { trx }
        )
    })
    if (syncDebtPeriod) {
        // update partner debt payout amount
        const successTrans = await Transaction.getPartnerDebtTransactionSuccess(
            debt.partner_id,
            debt.debt_period_key
        )

        let totalWithdrawal = successTrans.filter(
            (item) => item.type === 'withdrawal'
        )

        const totalDeposit = successTrans.filter(
            (item) => item.type === 'deposit'
        )

        totalWithdrawal = totalWithdrawal.map((item) => {
            item.amount = Math.abs(item.amount)

            return item
        })

        const totalPayout =
            sumBy(totalDeposit, 'amount') - sumBy(totalWithdrawal, 'amount')

        await PartnerDebt.updateById(id, { payout_amount: totalPayout })
        await DebtPeriod.syncDebtPeriod(debt.debt_period_key)
    }
    const updatedDebt = await PartnerDebt.getOverviewStats({ id })

    return { is_success: true, data: updatedDebt }
}
exports.supplierExportDebt = async (request, reply) => {
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
    query.partner_id = user.partner_id
    option.paginate.perPage = null
    const debt = await PartnerDebt.getListingV2(option, query)

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
