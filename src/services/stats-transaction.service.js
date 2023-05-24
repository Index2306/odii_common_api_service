/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const _ = require('lodash')
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
} = require('../constants/oms-status')
const {
    BOT_USER_ID,
    TRANSACTION_TYPE,
    TRANSACTION_ACTION,
    CURRENCY_CODE: { VND },
    TRANSACTION_STATUS,
    TRANSACTION_METHOD,
    ACC_TYPE,
    TRANSACTION_FILTER,
} = require('../constants')
const TransactionService = require('./transaction.service')
const AuditLog = require('../models/audit-log')
const Transaction = require('../models/transaction')
const { arrayToMap } = require('../utils/common.util')
const AppError = require('../utils/app-error')

exports.transactionStatsByDays = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            knex.raw(
                `DATE(created_at::timestamp AT time zone '${timezone}')        as date`
            ),
            knex.raw(
                `count(1)                                         AS quantity`
            ),
            knex.raw(`sum(amount)                           AS amount`),
        ])
        .from('transaction')

    const condition = {
        is_deleted: false,
    }

    if (whereCondition.partner_id)
        condition.partner_id = whereCondition.partner_id

    if (options.partner_id)
        condition['transaction.partner_id'] = options.partner_id
    if (options.user_id) condition['transaction.by_user_id'] = options.user_id
    if (options.source) condition['transaction.source'] = options.source

    if (whereCondition?.type)
        condition['transaction.type'] = whereCondition.type
    if (whereCondition?.status)
        condition['transaction.status'] = whereCondition.status
    if (whereCondition?.short_code)
        condition['transaction.short_code'] = whereCondition.short_code
    if (whereCondition?.long_code)
        condition['transaction.long_code'] = whereCondition.long_code

    query.where(condition)

    if (whereCondition?.from_time) {
        query.andWhere('created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('created_at', '<=', whereCondition.to_time)

    if (whereCondition?.transaction_type && options.source) {
        const actionType = []
        if (whereCondition?.transaction_type === TRANSACTION_FILTER.PAY) {
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
            actionType.push(TRANSACTION_ACTION.SUP_FF_FAIL)
        }

        if (whereCondition?.transaction_type === TRANSACTION_FILTER.RECEIVE) {
            actionType.push(TRANSACTION_ACTION.SELLER_GET_REFUND) // tiền nhận lại khi refund
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
        }

        if (whereCondition?.transaction_type === TRANSACTION_FILTER.DEPOSIT) {
            actionType.push(TRANSACTION_ACTION.DEPOSIT)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.WITHDRAWAL
        ) {
            actionType.push(TRANSACTION_ACTION.WITHDRAWAL)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.SUP_WALLET
        ) {
            actionType.push(TRANSACTION_ACTION.DEPOSIT)
            actionType.push(TRANSACTION_ACTION.WITHDRAWAL)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.SUP_REVENUE
        ) {
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
            actionType.push(TRANSACTION_ACTION.SUP_FF_FAIL)
            actionType.push(TRANSACTION_ACTION.SELLER_GET_REFUND)
        }

        if (!_.isEmpty(actionType))
            query.whereIn('transaction.action_type', actionType)
    }

    query.groupBy('date')

    const result = await query

    return result
}

exports.getSumDebtBalance = async (options, whereCondition) => {
    const query = knex
        .select([
            knex.raw(`count(1)::INTEGER AS quantity`),
            knex.raw(`sum(amount) AS amount`),
        ])
        .from('transaction')

    const condition = {
        'transaction.method': TRANSACTION_METHOD.DEBT,
    }

    if (whereCondition?.from_confirmed_at && whereCondition?.to_confirmed_at) {
        query.andWhere('confirmed_at', '>=', whereCondition?.from_confirmed_at)
        query.andWhere('confirmed_at', '<=', whereCondition?.to_confirmed_at)
    }

    if (whereCondition?.from_completed_at && whereCondition?.to_completed_at) {
        query.andWhere('completed_at', '>=', whereCondition?.from_completed_at)
        query.andWhere('completed_at', '<=', whereCondition?.to_completed_at)
    }

    if (options.status_not_in) query.whereNotIn('status', options.status_not_in)
    if (options.is_order_transaction === true) query.whereNotNull('order_id')
    if (options.status_in) query.whereIn('status', options.status_in)

    if (options?.type) condition.type = options.type
    // if (options?.partner_id) condition.partner_id = options.partner_id
    if (options?.source) condition.source = options.source
    if (options?.status) condition.status = options.status
    if (options?.debt_period_key || whereCondition?.debt_period_key)
        condition.debt_period_key =
            options.debt_period_key || whereCondition?.debt_period_key
    if (options?.payout_period_key || whereCondition?.payout_period_key)
        condition.payout_period_key =
            options.payout_period_key || whereCondition?.payout_period_key

    if (options?.partner_id || whereCondition?.partner_id)
        condition.partner_id = options.partner_id || whereCondition?.partner_id

    if (whereCondition?.transaction_type && options.source) {
        const actionType = []
        if (whereCondition?.transaction_type === TRANSACTION_FILTER.PAY) {
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
            actionType.push(TRANSACTION_ACTION.SUP_FF_FAIL)
        }

        if (whereCondition?.transaction_type === TRANSACTION_FILTER.RECEIVE) {
            actionType.push(TRANSACTION_ACTION.SELLER_GET_REFUND) // tiền nhận lại khi refund
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
        }

        if (whereCondition?.transaction_type === TRANSACTION_FILTER.DEPOSIT) {
            actionType.push(TRANSACTION_ACTION.DEPOSIT)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.WITHDRAWAL
        ) {
            actionType.push(TRANSACTION_ACTION.WITHDRAWAL)
        }

        if (whereCondition?.transaction_type === TRANSACTION_FILTER.DEPOSIT) {
            actionType.push(TRANSACTION_ACTION.DEPOSIT)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.SUP_WALLET
        ) {
            actionType.push(TRANSACTION_ACTION.DEPOSIT)
            actionType.push(TRANSACTION_ACTION.WITHDRAWAL)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.SUP_REVENUE
        ) {
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
            actionType.push(TRANSACTION_ACTION.SUP_FF_FAIL)
            actionType.push(TRANSACTION_ACTION.SELLER_GET_REFUND)
        }
        if (!_.isEmpty(actionType))
            query.whereIn('transaction.action_type', actionType)
    }

    query.where(condition)

    console.log(query.toString())
    const result = await query.first()

    return result
}
