import Logger from '../logger'

const BlueBird = require('bluebird')

// const moment_tz = require('moment-timezone')
const moment = require('moment-timezone')
// const _ = require('lodash')
const AppError = require('../utils/app-error')
const Transaction = require('../models/transaction')
const Tenant = require('../models/tenant')
const Balance = require('../models/balance')
const Bank = require('../models/bank')
const PartnerDebt = require('../models/partner-debt')
const DebtPeriod = require('../models/debt-period')
const EmailService = require('./email')
const AuditLog = require('../models/audit-log')
const OrderRepo = require('../models/order')
const NotificationService = require('./notification')
const {
    TRANSACTION_STATUS,
    BOT_USER_ID,
    TRANSACTION_METHOD,
    TRANSACTION_TYPE,
    ACC_TYPE,
    TRANSACTION_ACTION,
} = require('../constants/index')
const { TIME_ZONE } = require('../constants/index')
const { useMyTrx } = require('../connections/pg-general')
const {
    getTransactionCode,
    parseNumber,
    getBarcode,
} = require('../utils/common.util')

const {
    getCurrentDebtPeriodTime,
    // getNextPayoutPeriodTime,
    // parseTimestampForQuery,
    // getListDebtPeriodTimeDesc,
} = require('../utils/datetime.util')

const { CONFIRM_STATUS } = require('../constants/oms-status')
const { default: logger } = require('../logger')

// eslint-disable-next-line import/prefer-default-export
exports.checkTransactionStt = async () => {
    const moment24HoursAgo = moment_tz()
        .tz(TIME_ZONE.VN_TZ)
        .subtract(1440, 'minute') // 24h = 1440 mins

    const transactions = await Transaction.getTransactionByStatus({
        status: TRANSACTION_STATUS.PENDING,
        method: 'bank',
        created_at: moment24HoursAgo.toISOString(),
    })
    await BlueBird.map(
        transactions,
        async (transaction) => {
            console.log('RUN AT Transaction ID = ', transaction.id)
            try {
                await Transaction.updateTransactionById(transaction.id, {
                    status: TRANSACTION_STATUS.FAILED,
                    method: 'bank',
                }).catch((err) => {
                    console.error('await Transaction.update')
                    console.error(err)
                })
            } catch (err) {
                console.error('checkTranStt id = ', transaction.id)
                console.error(err)
            }
        },
        { concurrency: 5 }
    )
    console.log('DONE run checkTransactionStt')
}

/**
 * @description: Tạo các giao dịch thanh toán từ balance
 * @param {*} object
 * @param {*} inputTrx
 * @returns
 */
exports.makeUserSpendTransaction = async (
    {
        user,
        for_partner_id,
        amount,
        source,
        from_note,
        from_trans_action_type,
        order_id,
        order_code,
        type,
        tenant_id,
    },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        if (amount <= 0) throw new Error('invalid_amount')

        const fromBalance = await Balance.getPrimaryBalanceByPartner(
            for_partner_id,
            { trx }
        )

        const tenant = await Tenant.getDomainByTenantId(tenant_id)

        const balanceAmount = {
            amount: fromBalance.amount - amount,
        }

        balanceAmount.amount = (fromBalance.amount * 1 || 0) - amount
        if (fromBalance.amount - amount < tenant.min_limit_amount)
            throw new AppError('not_enough_amount', {
                message: 'Số dư tài khoản của bạn không dủ',
            })
        balanceAmount.spend_amount =
            (fromBalance.spend_amount * 1 || 0) + amount

        console.log('balanceAmount = ', balanceAmount)

        const updatefromBalanceResult = await Balance.updateBalanceById(
            fromBalance.id,
            balanceAmount,
            { trx }
        )

        const [from_transaction_id] = await Transaction.insertTransaction(
            {
                balance_id: fromBalance.id,
                amount: amount * -1,
                partner_id: for_partner_id,
                status: TRANSACTION_STATUS.SUCCEEDED,
                gateway: 'odii',
                type: TRANSACTION_TYPE.WITHDRAWAL || type,
                by_user_id: user.id || BOT_USER_ID,
                long_code: getTransactionCode(),
                completed_at: new Date().toISOString(),
                action_type: from_trans_action_type,
                source,
                note: from_note,
                order_id,
                order_code,
                tenant_id,
                balance_amount: balanceAmount.amount || fromBalance.amount,
            },
            { trx }
        )

        return {
            from_balance_id: fromBalance.id,
            updatefromBalanceResult,
            id: from_transaction_id,
            amount,
        }
    })

/**
 * @description: Hủy bỏ và refund các giao dịch của SELLER
 * @param {*} object
 * @param {*} inputTrx
 * @returns
 */

exports.makeTransactionPromotion = async (
    {
        user,
        for_partner_id,
        amount,
        source,
        promotion_id,
        transaction_type,
        note,
        action_type,
        tenant_id,
    },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        if (amount <= 0) throw new Error('invalid_amount')

        let completedTime = moment()

        const currentDebtPeriod = getCurrentDebtPeriodTime(
            'Asia/Ho_Chi_Minh',
            completedTime
        )

        const fromBalance = await Balance.getPrimaryBalanceByPartner(
            for_partner_id,
            { trx }
        )

        const transactionBody = {
            balance_id: fromBalance.id,
            balance_amount: fromBalance.amount,
            amount: user.account_type === 'supplier' ? amount * -1 : amount * 1,
            partner_id: for_partner_id,
            status: TRANSACTION_STATUS.PENDING,
            gateway: 'odii',
            method: TRANSACTION_METHOD.DEBT,
            type: transaction_type,
            by_user_id: user?.id || BOT_USER_ID,
            long_code: getTransactionCode(),
            action_type,
            source,
            note,
            promotion_id,
            tenant_id,
        }

        const [from_transaction_id] = await Transaction.insertTransaction(
            transactionBody,
            { trx }
        )

        const [transaction] = await Transaction.updateTransaction(
            {
                id: from_transaction_id,
                partner_id: for_partner_id,
                status: TRANSACTION_STATUS.PENDING,
                method: TRANSACTION_METHOD.DEBT,
            },
            {
                status: TRANSACTION_STATUS.CONFIRMED,
                confirmed_at: new Date().toISOString(),
                confirm_status: CONFIRM_STATUS.PLATFORM_CONFIRMED,
                debt_period_key: currentDebtPeriod.key,
            },
            { trx }
        )

        console.log('update transaction debt result = ', transaction)
        if (!transaction) {
            Logger.warn(
                `confirmedDeptTransaction transaction not found. promotion_id=${promotion_id}`
            )
            throw new AppError('update_debt_transaction_fail', {
                message:
                    'Không thể cập nhật giao dịch công nợ. Vui lòng liên hệ hỗ trợ',
            })
        }

        return {
            id: from_transaction_id,
            amount: user.account_type === 'supplier' ? amount * -1 : amount * 1,
        }
    })

exports.cancelAndRefundSellerTransaction = async (
    {
        user,
        for_partner_id,
        amount,
        source,
        from_note,
        from_trans_action_type,
        order_id,
        order_code,
        tenant_id,
    },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        if (amount <= 0) throw new Error('invalid_amount')

        const fromBalance = await Balance.getPrimaryBalanceByPartner(
            for_partner_id,
            { trx }
        )
        const amountNumber = 1 * amount || 0
        const balanceAmount = {}

        balanceAmount.amount = (fromBalance.amount * 1 || 0) + amountNumber

        balanceAmount.spend_amount =
            (fromBalance.spend_amount * 1 || 0) - amountNumber

        console.log('balanceAmount = ', balanceAmount)

        const updatefromBalanceResult = await Balance.updateBalanceById(
            fromBalance.id,
            balanceAmount,
            { trx }
        )

        const [from_transaction_id] = await Transaction.insertTransaction(
            {
                balance_id: fromBalance.id,
                amount: amountNumber,
                partner_id: for_partner_id,
                status: TRANSACTION_STATUS.SUCCEEDED,
                gateway: 'odii',
                type: TRANSACTION_TYPE.DEPOSIT,
                by_user_id: user?.id || BOT_USER_ID,
                long_code: getTransactionCode(),
                completed_at: new Date().toISOString(),
                action_type: from_trans_action_type,
                source,
                order_id,
                order_code,
                note: from_note,
                balance_amount: balanceAmount.amount,
                tenant_id,
            },
            { trx }
        )

        return {
            from_balance_id: fromBalance.id,
            updatefromBalanceResult,
            id: from_transaction_id,
            amountNumber,
            balance_amount: balanceAmount.amount,
        }
    })

/**
 * Tạo transactions CÔNG NỢ (ODII Nợ User)
 * @param {*} param0
 * @param {*} inputTrx
 */
exports.makeDeptTransaction = async (
    {
        user,
        to_partner_id,
        amount,
        source,
        note,
        action_type,
        order_id,
        order_code,
        method,
        type,
        tenant_id,
    },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        if (amount <= 0) throw new Error('invalid_amount')
        const fromBalance = await Balance.getPrimaryBalanceByPartner(
            to_partner_id,
            { trx }
        )
        const transactionBody = {
            balance_id: fromBalance.id,
            balance_amount: fromBalance.amount,
            amount,
            partner_id: to_partner_id,
            status: TRANSACTION_STATUS.PENDING,
            gateway: 'odii',
            method: method || TRANSACTION_METHOD.DEBT,
            type: type || TRANSACTION_TYPE.DEPOSIT,
            by_user_id: user?.id || BOT_USER_ID,
            long_code: getTransactionCode(),
            action_type,
            source,
            note,
            order_id,
            order_code,
            tenant_id,
        }
        const [from_transaction_id] = await Transaction.insertTransaction(
            transactionBody,
            { trx }
        )

        return {
            id: from_transaction_id,
            ...transactionBody,
        }
    })

/**
 * HỦY BỎ transactions CÔNG NỢ (ODII Nợ User)
 * @param {*} inputTrx
 */
exports.cancelDeptTransaction = async (
    { for_partner_id, order_id },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) =>
        Transaction.updateTransaction(
            {
                order_id,
                partner_id: for_partner_id,
                status: TRANSACTION_STATUS.PENDING,
                method: TRANSACTION_METHOD.DEBT || TRANSACTION_METHOD.CHECK,
            },
            {
                status: TRANSACTION_STATUS.CANCELLED,
                confirm_status: CONFIRM_STATUS.SUPPLIER_CANCELLED,
            },
            { trx }
        )
    )

/**
 * @description: XAC NHAN transactions CÔNG NỢ (ODII Nợ User), xay ra khi seller delivered order
 * @param {*} inputTrx
 */

exports.comfirmedAddNewTransaction = async (
    { id, debtPeriodKey, for_partner_id, type, tenant_id },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        const [transaction] = await Transaction.updateTransaction(
            {
                id,
            },
            {
                status: TRANSACTION_STATUS.CONFIRMED,
                confirmed_at: new Date().toISOString(),
                confirm_status: CONFIRM_STATUS.PLATFORM_CONFIRMED,
                debt_period_key: debtPeriodKey,
            },
            { trx }
        )
        if (!transaction)
            throw new AppError('update_debt_transaction_fail', {
                message:
                    'Không thể thêm giao dịch công nợ. Vui lòng liên hệ hỗ trợ',
            })

        let currentPartnerPeriod = await PartnerDebt.getOne(
            {
                partner_id: for_partner_id,
                debt_period_key: debtPeriodKey,
                tenant_id,
            },
            { trx }
        )
        if (!currentPartnerPeriod) {
            const result = await PartnerDebt.insert(
                {
                    partner_id: for_partner_id,
                    debt_period_key: debtPeriodKey,
                    total_revenue: 0,
                    total_fee: 0,
                    debt_status: 'pending',
                    tenant_id,
                },
                { trx }
            )
            // eslint-disable-next-line prefer-destructuring
            currentPartnerPeriod = result[0]
        }
        const transactionAmount = parseNumber(transaction.amount)
        if (type === 'deposit') {
            await PartnerDebt.increment(
                { id: currentPartnerPeriod.id },
                {
                    total_revenue: transactionAmount,
                    total_fee: 0,
                    number_of_order: 1,
                },
                { trx }
            )

            await DebtPeriod.increment(
                { key: debtPeriodKey, tenant_id },
                {
                    debt_amount: transactionAmount,
                    number_of_order: 1,
                },
                { trx }
            )
        } else {
            await PartnerDebt.decrement(
                { id: currentPartnerPeriod.id },
                {
                    total_revenue: transactionAmount,
                    total_fee: 0,
                },
                { trx }
            )

            await DebtPeriod.decrement(
                { key: debtPeriodKey, tenant_id },
                {
                    debt_amount: transactionAmount,
                },
                { trx }
            )

            await PartnerDebt.increment(
                { id: currentPartnerPeriod.id },
                {
                    number_of_order: 1,
                },
                { trx }
            )

            await DebtPeriod.increment(
                { key: debtPeriodKey, tenant_id },
                {
                    number_of_order: 1,
                },
                { trx }
            )
        }

        return transaction
    })

exports.confirmedDebtPromotionTransaction = async (
    { for_partner_id, amount, tenant_id },
    { inputTrx = undefined }
) =>
    useMyTrx(inputTrx, async (trx) => {
        let completedTime = moment()
        const currentDebtPeriod = getCurrentDebtPeriodTime(
            'Asia/Ho_Chi_Minh',
            completedTime
        )
        let currentPartnerPeriod = await PartnerDebt.getOne(
            {
                partner_id: for_partner_id,
                debt_period_key: currentDebtPeriod.key,
            },
            { trx }
        )

        if (!currentPartnerPeriod) {
            const result = await PartnerDebt.insert(
                {
                    partner_id: for_partner_id,
                    debt_period_key: currentDebtPeriod.key,
                    total_revenue: 0,
                    total_fee: 0,
                    debt_status: 'pending',
                    tenant_id,
                },
                { trx }
            )
            // eslint-disable-next-line prefer-destructuring
            currentPartnerPeriod = result[0]
        }
        const transactionAmount = parseNumber(amount)
        await PartnerDebt.increment(
            { id: currentPartnerPeriod.id },
            {
                total_revenue: transactionAmount,
                total_fee: 0,
                number_of_order: 1,
            },
            { trx }
        )

        await DebtPeriod.increment(
            { key: currentDebtPeriod.key, tenant_id },
            {
                debt_amount: transactionAmount,
                number_of_order: 1,
            },
            { trx }
        )
    })

exports.confirmedDeptTransaction = async (
    { for_partner_id, order_id, tenant_id },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        // Get updated time of order to determine completed order time
        const order = await OrderRepo.getOrderById(order_id)
        let completedTime = moment()
        if (
            order?.raw_data &&
            order?.platform === 'lazada' &&
            order?.raw_data?.updated_at
        ) {
            completedTime = moment(order?.raw_data?.updated_at)
        } else if (
            order?.raw_data &&
            (order?.platform === 'shopee' || order?.platform === 'tiktok') &&
            order?.raw_data?.update_time
        ) {
            completedTime = moment.unix(order?.raw_data?.update_time)
        }
        const currentDebtPeriod = getCurrentDebtPeriodTime(
            'Asia/Ho_Chi_Minh',
            completedTime
        )
        const [transaction] = await Transaction.updateTransaction(
            {
                order_id,
                partner_id: for_partner_id, // supplier
                status: TRANSACTION_STATUS.PENDING,
                method: TRANSACTION_METHOD.DEBT,
            },
            {
                status: TRANSACTION_STATUS.CONFIRMED,
                confirmed_at: new Date().toISOString(),
                confirm_status: CONFIRM_STATUS.PLATFORM_CONFIRMED,
                debt_period_key: currentDebtPeriod.key,
            },
            { trx }
        )
        console.log('update transaction debt result = ', transaction)
        if (!transaction) {
            Logger.warn(
                `confirmedDeptTransaction transaction not found. orderId=${order_id}`
            )
            throw new AppError('update_debt_transaction_fail', {
                message:
                    'Không thể cập nhật giao dịch công nợ. Vui lòng liên hệ hỗ trợ',
            })
        }

        // Cộng amount vào bảng partner_vs_debt va
        let currentPartnerPeriod = await PartnerDebt.getOne(
            {
                partner_id: for_partner_id,
                debt_period_key: currentDebtPeriod.key,
            },
            { trx }
        )

        if (!currentPartnerPeriod) {
            const result = await PartnerDebt.insert(
                {
                    partner_id: for_partner_id,
                    debt_period_key: currentDebtPeriod.key,
                    total_revenue: 0,
                    total_fee: 0,
                    debt_status: 'pending',
                    tenant_id,
                },
                { trx }
            )
            // eslint-disable-next-line prefer-destructuring
            currentPartnerPeriod = result[0]
        }
        const transactionAmount = parseNumber(transaction.amount)
        await PartnerDebt.increment(
            { id: currentPartnerPeriod.id },
            {
                total_revenue: transactionAmount,
                total_fee: 0,
                number_of_order: 1,
            },
            { trx }
        )

        await DebtPeriod.increment(
            { key: currentDebtPeriod.key, tenant_id },
            {
                debt_amount: transactionAmount,
                number_of_order: 1,
            },
            { trx }
        )

        return transaction
    })

exports.sellerReturnedDeptTransaction = async (
    { for_partner_id, order_id },
    inputTrx = undefined
) =>
    useMyTrx(inputTrx, async (trx) => {
        // const currentDebtPeriod = getCurrentDebtPeriodTime()
        const [transaction] = await Transaction.updateTransaction(
            {
                order_id,
                partner_id: for_partner_id, // supplier
                confirm_status: TRANSACTION_STATUS.PENDING,
                method: TRANSACTION_METHOD.DEBT,
            },
            {
                // status: TRANSACTION_STATUS.CONFIRMED,
                confirmed_at: new Date().toISOString(),
                confirm_status: CONFIRM_STATUS.SELLER_RETURNED,
                // debt_period_key: currentDebtPeriod.key,
            },
            { trx }
        )
        console.log('update transaction debt result = ', transaction)
        if (!transaction)
            throw new AppError('update_debt_transaction_fail', {
                message:
                    'Không thể cập nhật giao dịch công nợ. Vui lòng liên hệ hỗ trợ',
            })

        return transaction
    })

const notifyTransactionStatusToUser = async (
    status,
    { note, source, user_id, transactionData }
) => {
    const userIds = [transactionData.from_user.id]
    if (status === TRANSACTION_STATUS.SUCCEEDED) {
        await EmailService.TransactionNotify({
            email: transactionData.from_user.email,
            transaction: transactionData,
        })
        NotificationService.sendMessage(user_id, {
            type: 'transaction',
            status,
            partner_id: transactionData.partner_id,
            arrReceiver: userIds,
            source: 'admin',
            metadata: {
                method: transactionData.method,
                amount: transactionData.amount,
            },
            data_id: transactionData.id,
        })
    }
    if (status === TRANSACTION_STATUS.FAILED) {
        await EmailService.TransactionFailed({
            email: transactionData.from_user.email,
            transaction: transactionData,
            note,
            source,
        })
        NotificationService.sendMessage(user_id, {
            type: 'transaction',
            status,
            partner_id: transactionData.partner_id,
            arrReceiver: userIds,
            source: 'admin',
            metadata: {
                status,
            },
            data_id: transactionData.id,
        })
    }

    return true
}

exports.adminApproveSellerAffiliateCommision = async (
    { for_partner_id, amount, bank_id, note, payout_affiliate_key, tenant_id },
    inputTrx = undefined
) => {
    const transId = await useMyTrx(inputTrx, async (trx) => {
        const userPrimaryBalance = await Balance.getPrimaryBalanceByPartner(
            for_partner_id
        )
        console.log('userPrimaryBalance', userPrimaryBalance)
        if (!userPrimaryBalance) throw new Error('Không tìm thấy ví của Seller')
        userPrimaryBalance.amount =
            (userPrimaryBalance.amount * 1 || 0) + amount
        userPrimaryBalance.affiliate_commission_amount =
            (userPrimaryBalance.affiliate_commission_amount * 1 || 0) + amount
        await Balance.updateBalanceById(
            userPrimaryBalance.id,
            userPrimaryBalance,
            { trx }
        )
        const completedAt = new Date().toISOString()
        const transaction = {
            balance_id: userPrimaryBalance.id,
            balance_amount: userPrimaryBalance.amount,
            long_code: getTransactionCode(),
            short_code: getBarcode(),
            partner_id: for_partner_id,
            type: TRANSACTION_TYPE.DEPOSIT,
            method: TRANSACTION_METHOD.ODII,
            amount,
            bank_id,
            action_type: TRANSACTION_ACTION.AFFILIATE_COMMISSION,
            source: ACC_TYPE.SELLER,
            status: TRANSACTION_STATUS.SUCCEEDED,
            note,
            completed_at: completedAt,
            payout_affiliate_key,
            confirm_status: CONFIRM_STATUS.CHIEF_ACCOUNTANT_CONFIRMED,
            confirmed_at: completedAt,
            tenant_id,
        }
        const [transactionId] = await Transaction.insertTransaction(
            transaction,
            { trx }
        )
        logger.info(
            `[adminUpdateCommission] confirmed. Balance: ${JSON.stringify(
                userPrimaryBalance
            )}`
        )

        return transactionId
    })
    logger.info(`adminApproveSellerAffiliateCommision transId=${transId}`)

    return transId
}
exports.sendConfirmAffiliteTransactionNotification = async (
    transactionId,
    note,
    user_id
) => {
    const transactionData = await Transaction.getTransactionById(transactionId)
    if (transactionData) {
        notifyTransactionStatusToUser('confirmed', {
            note,
            source: ACC_TYPE.ADMIN,
            user_id,
            transactionData,
        })
        AuditLog.addTransactionLogAsync(transactionId, {
            source: ACC_TYPE.ADMIN,
            user_id,
            action: 'update',
            note,
            metadata: {
                status: transactionData.status,
                completed_at: transactionData.completed_at,
                amount: transactionData.amount,
                confirm_status: transactionData.status,
            },
        })
    }
}
exports.confirmBankTransfer = async (
    id,
    { status, note, source, user_id },
    inputTrx
) => {
    const transactionData = await Transaction.getTransactionById(id)
    console.log('transactionData', transactionData)

    if (!transactionData) throw new Error('TRANSACTION_STATUS_NOT_PENDING')
    const completed_at = new Date().toISOString()
    const confirmResult = await useMyTrx(inputTrx, async (trx) => {
        const userBalance = await Balance.getPrimaryBalanceByPartner(
            transactionData.partner_id
        )
        console.log('status: ', status)
        if (status === CONFIRM_STATUS.CHIEF_ACCOUNTANT_REJECTED) {
            await Transaction.updateTransactionById(id, {
                balance_amount: userBalance.amount,
                status,
                note,
                completed_at,
                updated_at: new Date().toISOString(),
            })

            return status
        }

        const balanceAmount = {
            amount: userBalance.amount * 1 + transactionData.amount * 1,
        }

        balanceAmount.amount =
            (userBalance.amount * 1 || 0) + transactionData.amount
        if (transactionData.type === TRANSACTION_TYPE.WITHDRAWAL) {
            balanceAmount.withdrawal_amount =
                (userBalance.withdrawal_amount * 1 || 0) +
                Math.abs(transactionData.amount)
        }
        if (transactionData.type === TRANSACTION_TYPE.DEPOSIT) {
            balanceAmount.deposit_amount =
                (userBalance.deposit_amount * 1 || 0) +
                Math.abs(transactionData.amount)
        }

        if (transactionData.method === TRANSACTION_METHOD.BANK) {
            await Balance.updateBalanceById(
                transactionData.balance_id,
                balanceAmount,
                { trx }
            )
        }

        await Transaction.updateTransactionById(
            id,
            {
                balance_amount: userBalance.amount,
                status,
                note,
                completed_at,
                updated_at: new Date().toISOString(),
            },
            { trx }
        )

        if (transactionData?.to_bank.confirm_status !== 'confirmed') {
            await Bank.updateBankById(transactionData.bank_id, {
                confirm_status: 'confirmed',
            })
        }

        return status
    })

    console.log('confirmResult = ', confirmResult)

    notifyTransactionStatusToUser(status, {
        note,
        source,
        user_id,
        transactionData,
    })
    AuditLog.addTransactionLogAsync(id, {
        source,
        user_id,
        action: 'update',
        note,
        metadata: {
            status,
            completed_at,
            amount: transactionData.amount,
            confirm_status: status,
        },
    })
}

exports.confirmPartnerDebtTransfer = async (
    ids,
    { source, user_id, partner_id },
    inputTrx
) => {
    // eslint-disable-next-line no-restricted-syntax
    // eslint-disable-next-line no-await-in-loop
    const userBalance = await Balance.getPrimaryBalanceByPartner(partner_id)
    console.log(
        `[confirmPartnerDebtTransfer-before] balanceId=${userBalance.id} amount: ${userBalance.amount} debt_amount=${userBalance.debt_amount}`
    )
    logger.info(
        `[confirmPartnerDebtTransfer-before] balanceId=${userBalance.id} amount: ${userBalance.amount} debt_amount=${userBalance.debt_amount}`
    )
    let balanceAmount = userBalance.amount * 1
    let totalAmountChange = 0
    let debtAmount = userBalance.debt_amount * 1

    // eslint-disable-next-line no-restricted-syntax
    for (const transId of ids) {
        // eslint-disable-next-line no-await-in-loop
        const transactionData = await Transaction.getTransactionById(transId)
        if (!transactionData) throw new Error('TRANSACTION_NOT__FOUND')
        const completed_at = new Date().toISOString()
        balanceAmount += transactionData.amount * 1
        totalAmountChange += transactionData.amount * 1
        debtAmount += transactionData.amount * 1
        // eslint-disable-next-line no-await-in-loop
        await Transaction.updateTransactionById(
            transId,
            {
                status: TRANSACTION_STATUS.SUCCEEDED,
                note: 'Công nợ theo đơn hàng',
                completed_at,
                updated_at: new Date().toISOString(),
                balance_amount: balanceAmount,
                confirm_status: CONFIRM_STATUS.CHIEF_ACCOUNTANT_CONFIRMED,
            },
            { trx: inputTrx }
        )
        AuditLog.addTransactionLogAsync(transId, {
            source,
            user_id,
            action: 'update',
            note: 'Quyết toán công nợ',
            metadata: {
                status: TRANSACTION_STATUS.SUCCEEDED,
                completed_at,
                amount: transactionData.amount,
                confirm_status: CONFIRM_STATUS.CHIEF_ACCOUNTANT_CONFIRMED,
            },
        })
        notifyTransactionStatusToUser(TRANSACTION_STATUS.SUCCEEDED, {
            note: 'Quyết toán công nợ',
            source,
            user_id,
            transactionData,
        })
        console.log(
            `[confirmPartnerDebtTransfer] tranId=${transId} Amount=${transactionData.amount
            } BalanceAmount=${JSON.stringify(balanceAmount)}`
        )
        logger.info(
            `[confirmPartnerDebtTransfer] tranId=${transId} Amount=${transactionData.amount
            } BalanceAmount=${JSON.stringify(balanceAmount)}`
        )
    }
    // eslint-disable-next-line no-await-in-loop
    await Balance.updateBalanceById(
        userBalance.id,
        {
            amount: balanceAmount,
            debt_amount: debtAmount,
        },
        { trx: inputTrx }
    )
    console.log(
        `[confirmPartnerDebtTransfer] balanceId=${userBalance.id} amount: ${balanceAmount} debt_amount=${debtAmount} Change=${totalAmountChange}`
    )
    logger.info(
        `[confirmPartnerDebtTransfer] balanceId=${userBalance.id} amount: ${balanceAmount} debt_amount=${debtAmount} Change=${totalAmountChange}`
    )
}
