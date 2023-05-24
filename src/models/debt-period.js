// const moment = require('moment')
const moment = require('moment-timezone')
const _ = require('lodash')
const { getKnex, knex } = require('../connections/pg-general')
const TenantDomain = require('../models/tenant')

const {
    DEBT_BEGIN_TIME,
    DEBT_TIME_ZONE,
    DEBT_PERIOD_TIME_DAYS,
} = require('../config')
const {
    createDefaultPayoutPeriod,
    genPayoutPeriodStart,
    genPayoutPeriodEnd,
    genPayoutPeriodKey,
} = require('./payout-period')
const { isEmpty } = require('lodash')

const genDebtPeriodEnd = (debtPeriodStart) =>
    debtPeriodStart
        .clone()
        .add(DEBT_PERIOD_TIME_DAYS, 'days')
        .add(-1, 'seconds')

const genNextDebtPeriodStart = (currDebtPeriod) =>
    currDebtPeriod.debt_period_end.clone().add(1, 'seconds')

const genDebtPeriodKey = (debtPeriod) => {
    const dateFormat = 'YYYY-MM-DD'
    const keySeparator = '_'
    const keyParts = []
    keyParts.push(debtPeriod.debt_period_start.format(dateFormat))
    keyParts.push(debtPeriod.debt_period_end.format(dateFormat))
    const keyStr = keyParts.join(keySeparator)

    return keyStr
}

exports.genDebtPeriodKey = genDebtPeriodKey

const createDebtPeriod = (debtPeriodStart, tenant_id) => {
    const debtPeriod = {}
    // debtPeriod.amount = 0
    // debtPeriod.balance_amount = 0
    debtPeriod.tenant_id = tenant_id
    debtPeriod.number_of_order = 0
    debtPeriod.debt_period_start = debtPeriodStart
    debtPeriod.debt_period_end = genDebtPeriodEnd(debtPeriodStart)

    debtPeriod.payout_period_start = genPayoutPeriodStart(
        debtPeriod.debt_period_end
    )
    debtPeriod.payout_period_end = genPayoutPeriodEnd(
        debtPeriod.payout_period_start
    )

    debtPeriod.key = genDebtPeriodKey(debtPeriod)
    const { payout_period_start, payout_period_end } = debtPeriod
    debtPeriod.payout_period_key = genPayoutPeriodKey({
        payout_period_start,
        payout_period_end,
    })

    return debtPeriod
}

const insertDebtPeriod = async (data, { trx } = {}) =>
    getKnex('debt_period', trx).returning('id').insert(data)

exports.insertDebtPeriod = insertDebtPeriod

exports.getMany = async (condition, { trx } = {}) =>
    getKnex('debt_period', trx).select().where(condition)

exports.getOne = async (condition, { trx } = {}) =>
    getKnex('debt_period', trx).select().first().where(condition)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('debt_period', trx).update(data).where(condition)

exports.updateByKey = (key, data, { trx } = {}) =>
    getKnex('debt_period', trx).update(data).where('key', key)

exports.getManyByIds = (ids) => knex.from('debt_period').whereIn('id', ids)

exports.getManyByKeys = (keys) => knex.from('debt_period').whereIn('key', keys)

exports.increment = (condition, body, { trx } = {}) =>
    getKnex('debt_period', trx).increment(body).where(condition)

exports.decrement = (condition, body, { trx } = {}) =>
    getKnex('debt_period', trx).decrement(body).where(condition)

exports.genDebtPeriod = async (
    tenant_id,
    begin_time = DEBT_BEGIN_TIME,
    number = 160
) => {
    const debtPeriods = []
    let currDebtPeriodStart = moment(begin_time).tz(DEBT_TIME_ZONE)

    for (let i = 0; i < number; i += 1) {
        const currDebtPeriod = createDebtPeriod(currDebtPeriodStart, tenant_id)
        debtPeriods.push(currDebtPeriod)

        currDebtPeriodStart = genNextDebtPeriodStart(currDebtPeriod)
    }

    const ids = await insertDebtPeriod(debtPeriods)
    await createDefaultPayoutPeriod(debtPeriods, ids)
}

exports.getDebtPeriodListing = async (options = {}, whereCondition) => {
    const query = knex.select('*').from('debt_period')

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition?.key) {
            query.andWhere('key', whereCondition.key)
        }
        query.andWhere(condition)
    }

    if (options.tenant_id) query.andWhere('tenant_id', options.tenant_id)

    if (options.max_debt_period_end)
        query.andWhere('debt_period_end', '<=', options.max_debt_period_end)

    if (options.max_debt_period_start)
        query.andWhere('debt_period_end', '>=', options.max_debt_period_start)

    if (whereCondition.debt_period_key)
        query.andWhere('key', whereCondition.debt_period_key)

    if (whereCondition.payout_period_key)
        query.andWhere('payout_period_key', whereCondition.payout_period_key)

    if (whereCondition?.from_time)
        query.andWhere('debt_period_start', '>=', whereCondition.from_time) // new Date().toISOString()
    if (whereCondition?.to_time)
        query.andWhere('debt_period_end', '<=', whereCondition.to_time)

    const result = await query
        .orderBy('debt_period_start', 'desc')
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

exports.getDebtPerioldByTime = async (findTime) => {
    const query = knex
        .select('*')
        .first()
        .from('debt_period')
        .where('debt_period_start', '<=', findTime)
        .andWhere('debt_period_end', '>=', findTime)

    const data = await query

    return data
}
exports.getCurrentDebtPeriod = async (timezone = 'Asia/Ho_Chi_Minh') => {
    const currentTime = moment().tz(timezone)
    console.log('currentTime', currentTime)

    return exports.getDebtPerioldByTime(currentTime)
}
exports.syncDebtPeriod = async (periodKey) => {
    await knex.raw(`call public.sync_debt_period('${periodKey}')`)
}

exports.getPartnerDebtPerioldByTime = async (
    findTime,
    partner_id,
    tenant_id
) => {
    const query = knex
        .select('*')
        .first()
        .from('partner_vs_debt as pd')
        .innerJoin('debt_period as dp', 'pd.debt_period_key', 'dp.key')
        .where('dp.debt_period_start', '<=', findTime)
        .andWhere('dp.debt_period_end', '>=', findTime)

    if (partner_id) query.andWhere('pd.partner_id', partner_id)
    if (tenant_id) query.andWhere('dp.tenant_id', tenant_id)

    const data = await query

    return data
}
exports.getPartnerCurrentDebtPeriod = async (
    timezone = 'Asia/Ho_Chi_Minh',
    partner_id,
    tenant_id
) => {
    const currentTime = moment().tz(timezone)

    return exports.getPartnerDebtPerioldByTime(
        currentTime,
        partner_id,
        tenant_id
    )
}
