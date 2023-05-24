const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const {
    TRANSACTION_STATUS,
    ACC_TYPE,
    TRANSACTION_FILTER,
    TRANSACTION_ACTION,
} = require('../constants')
const { getBasicUser } = require('./model-helper')

exports.insertTransaction = (data, { trx } = {}) =>
    getKnex('transaction', trx).returning('id').insert(data)

exports.updateTransaction = (condition, data, { trx } = {}) =>
    getKnex('transaction', trx).update(data).where(condition).returning('*')

exports.updateTransactionById = (id, data, { trx } = {}) =>
    exports.updateTransaction({ id }, data, { trx })

// setTimeout(async () => {
//     console.log('run updateTransactionById')
//     const resutl = await exports.updateTransactionById(396, {
//         confirmed_at: '2021-10-21T06:01:13',
//         status: 'confirmed',
//     })
//     console.log('resutl = ', resutl)
// }, 2000)

exports.getTransaction = (condition) =>
    knex.first().from('transaction').where(condition)

exports.getTransactionForSMSConfirm = (short_code) =>
    knex
        .first()
        .from('transaction')
        .where('short_code', short_code)
        .whereIn('status', [
            TRANSACTION_STATUS.CREATED,
            TRANSACTION_STATUS.PENDING,
        ])

exports.getTransactionByStatus = async (condition) =>
    knex('transaction')
        .where('status', condition.status)
        .where('method', condition.method)
        .where('created_at', '<=', condition.created_at)

exports.getTransactionById = async (id, options = {}) => {
    const query = knex
        .first()
        .select([
            'transaction.*',
            'o.shop_order_id as shop_order_id',
            // knex.raw('row_to_json("user".*) as from_user'),
            getBasicUser('u', 'from_user'),
            knex.raw('row_to_json("bank".*) as to_bank'),
            knex.raw('row_to_json("bank_info".*) as bank_info'),
        ])
        .from('transaction')
        .leftJoin('partner', 'partner.id', 'transaction.partner_id')
        .leftJoin('user as u', 'u.id', 'partner.user_id')
        .leftJoin('bank', 'bank.id', 'transaction.bank_id')
        .leftJoin('bank_info', 'bank_info.id', 'bank.bank_info_id')
        .leftJoin('order as o', 'o.id', 'transaction.order_id')
        .where('transaction.id', id)
    if (options.status) {
        query.where('transaction.status', options.status)
    }
    if (options.confirm_status) {
        query.where('transaction.confirm_status', options.confirm_status)
    }

    const result = await query.orderBy('created_at', 'desc')

    return result
}

exports.getTransactions = async (options, whereCondition) => {
    let query = knex
        .select([
            'transaction.*',
            'o.shop_order_id as shop_order_id',
            getBasicUser('u', 'from_user'),
            knex.raw('row_to_json("bank".*) as to_bank'),
        ])
        .from('transaction')
        .leftJoin('partner', 'partner.id', 'transaction.partner_id')
        .leftJoin('user as u', 'u.id', 'partner.user_id')
        .leftJoin('order as o', 'o.id', 'transaction.order_id')
    const condition = {}
    query
        .where('transaction.is_deleted', false)
        .leftJoin('bank', 'bank.id', 'transaction.bank_id')
    // console.log('getTransactions', options, whereCondition)
    if (options.user_id) condition['transaction.by_user_id'] = options.user_id
    if (options.source) condition['transaction.source'] = options.source
    if (options.partner_id)
        condition['transaction.partner_id'] = options.partner_id
    if (options.tenant_id)
        condition['transaction.tenant_id'] = options.tenant_id

    if (whereCondition?.type)
        condition['transaction.type'] = whereCondition.type
    if (whereCondition?.method)
        condition['transaction.method'] = whereCondition.method
    if (whereCondition?.status)
        condition['transaction.status'] = whereCondition.status
    if (whereCondition?.short_code)
        condition['transaction.short_code'] = whereCondition.short_code
    if (whereCondition?.long_code)
        condition['transaction.long_code'] = whereCondition.long_code
    if (whereCondition?.account_type)
        condition['transaction.source'] = whereCondition.source
    if (whereCondition?.action_type)
        condition['transaction.action_type'] = whereCondition.action_type
    if (whereCondition?.partner_id)
        condition['transaction.partner_id'] = whereCondition.partner_id

    if (whereCondition.keyword) {
        query.where((builder) => {
            builder.where('short_code', 'ilike', `%${whereCondition.keyword}%`)
            builder.orWhere('long_code', 'ilike', `%${whereCondition.keyword}%`)
            builder.orWhere(
                'u.full_name',
                'ilike',
                `%${whereCondition.keyword}%`
            )
            builder.orWhere('u.email', 'ilike', `%${whereCondition.keyword}%`)

            return builder
        })
    }

    query = query.andWhere(condition)

    if (whereCondition?.from_time)
        query.andWhere('transaction.created_at', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition?.to_time)
        query.andWhere('transaction.created_at', '<=', whereCondition.to_time)
    if (whereCondition?.debt_period_key) {
        query.andWhere(
            'transaction.debt_period_key',
            '=',
            whereCondition.debt_period_key
        )
    }
    if (whereCondition.from_confirmed_at && whereCondition.to_confirmed_at) {
        query.andWhere(
            'transaction.confirmed_at',
            '>=',
            whereCondition.from_confirmed_at
        )
        query.andWhere(
            'transaction.confirmed_at',
            '<=',
            whereCondition.to_confirmed_at
        )
    }

    if (whereCondition.from_completed_at && whereCondition.to_completed_at) {
        query.andWhere(
            'transaction.completed_at',
            '>=',
            whereCondition.from_completed_at
        )
        query.andWhere(
            'transaction.completed_at',
            '<=',
            whereCondition.to_completed_at
        )
    }

    if (options.status_not_in) {
        query.whereNotIn('transaction.status', options.status_not_in)
    }

    if (options.status_in) {
        query.whereIn('transaction.status', options.status_in)
    }
    if (options?.confirm_status)
        query.where('transaction.confirm_status', options.confirm_status)

    if (options.confirm_status_in) {
        // console.log('options.confirm_status_in', options.confirm_status_in)
        query.whereIn('transaction.confirm_status', options.confirm_status_in)
    }

    if (whereCondition?.transaction_type) {
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
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
        }

        if (
            whereCondition?.transaction_type === TRANSACTION_FILTER.SUP_REVENUE
        ) {
            actionType.push(TRANSACTION_ACTION.CONFIRM_ORDER)
            actionType.push(TRANSACTION_ACTION.ADMIN_CONFIRM_TRANSACTION)
            actionType.push(TRANSACTION_ACTION.SUP_FF_FAIL)
            actionType.push(TRANSACTION_ACTION.SELLER_GET_REFUND)
            actionType.push(TRANSACTION_ACTION.PROMOTIONAL_GET_REFUND)
        }
        if (!_.isEmpty(actionType))
            query.whereIn('transaction.action_type', actionType)
    }
    const result = await query
        .orderBy('transaction.updated_at', 'desc')
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

exports.countTransaction = (whereCondition) =>
    knex.first().count('id').from('transaction').where(whereCondition)

exports.getTransactionsLimit = ({ limit, offset }) =>
    knex.select().from('transaction').limit(limit).offset(offset)

exports.getPartnerDebtTransactionReadyToComplete = async (
    partnerId,
    periodKey
) => {
    const query = knex('transaction')
        .where('partner_id', partnerId)
        .where('debt_period_key', periodKey)
        .where('status', 'confirmed')
    const data = await query

    return data
}

exports.getTransactionHaveDebt = async () => {
    const query = knex('transaction')
        .whereNotNull('debt_period_key')
        .whereNotNull('confirmed_at')
    const data = await query

    return data
}

exports.getPartnerDebtTransactionSuccess = async (partnerId, periodKey) => {
    const query = knex('transaction')
        .where('partner_id', partnerId)
        .where('debt_period_key', periodKey)
        .where('status', 'succeeded')
    const data = await query

    return data
}
