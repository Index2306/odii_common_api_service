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
    ACC_TYPE,
    TRANSACTION_FILTER,
} = require('../constants')
const TransactionService = require('./transaction.service')
const AuditLog = require('../models/audit-log')
const { arrayToMap } = require('../utils/common.util')
const AppError = require('../utils/app-error')
const { getBasicUser } = require('../models/model-helper')

exports.transactionStats = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            'action_type',
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

    query.groupBy('action_type')

    const result = await query

    return result
}

exports.transactionHistoryStats = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            // 'transaction.amount',
            // 'transaction.type',
            // 'c.created_at',
            // 'transaction.partner_id',
            'transaction.*',
            getBasicUser('u', 'from_user'),
        ])
        .from('transaction')
        .leftJoin('partner', 'partner.id', 'transaction.partner_id')
        .leftJoin('user as u', 'u.id', 'partner.user_id')

    const condition = {
        // is_deleted: false,
    }

    if (whereCondition.partner_id)
        condition.partner_id = whereCondition.partner_id

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
        query.andWhere('transaction.created_at', '>=', whereCondition.from_time)
    }

    if (whereCondition?.to_time)
        query.andWhere('transaction.created_at', '<=', whereCondition.to_time)

    const result = await query

    return result
}

exports.transactionCount = async (options, whereCondition, timezone) => {
    const query = knex
        .select([
            'type',
            knex.raw(`count(id)                           AS count`),
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

    query.groupBy('type')

    const result = await query

    return result
}
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
            'type',
        ])
        .from('transaction')

    const condition = {
        is_deleted: false,
    }
    console.log('whereCondition', whereCondition)

    if (whereCondition.partner_id)
        condition.partner_id = whereCondition.partner_id

    if (options.partner_id)
        condition['transaction.partner_id'] = options.partner_id
    if (options.user_id) condition['transaction.by_user_id'] = options.user_id
    if (options.source) condition['transaction.source'] = options.source

    if (whereCondition?.type)
        condition['transaction.type'] = whereCondition.type
    // if (whereCondition?.acc_type)
    //     condition['transaction.source'] = whereCondition.acc_type
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

    query.groupBy('date', 'type')

    const result = await query

    return result
}
