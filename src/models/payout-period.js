const moment = require('moment')
const { PAYOUT_PERIOD_TIME_DAYS } = require('../config')
const { getKnex, knex } = require('../connections/pg-general')

const insertPayoutPeriod = async (data, { trx } = {}) =>
    getKnex('payout_period', trx).returning('id').insert(data)
exports.insertPayoutPeriod = insertPayoutPeriod

const genPayoutPeriodKey = (payoutPeriod) => {
    const dateFormat = 'YYYY-MM-DD'
    const keySeparator = '_'
    const keyParts = []
    keyParts.push(payoutPeriod.payout_period_start.format(dateFormat))
    keyParts.push(payoutPeriod.payout_period_end.format(dateFormat))
    const keyStr = keyParts.join(keySeparator)

    return keyStr
}
exports.genPayoutPeriodKey = genPayoutPeriodKey

const genPayoutPeriodStart = (debtPeriodEnd) =>
    debtPeriodEnd.clone().add(1, 'seconds')
exports.genPayoutPeriodStart = genPayoutPeriodStart

const genPayoutPeriodEnd = (payoutPeriodStart) =>
    payoutPeriodStart
        .clone()
        .add(PAYOUT_PERIOD_TIME_DAYS, 'days')
        .add(-1, 'seconds')
exports.genPayoutPeriodEnd = genPayoutPeriodEnd

exports.createDefaultPayoutPeriod = async (
    debtDataRows,
    debtIdRows,
    { trx } = {}
) => {
    const rowLength = debtDataRows.length
    const payoutPeriods = []

    if (rowLength !== debtIdRows.length) {
        return
    }

    for (let i = 0; i < rowLength; i += 1) {
        const payoutPeriod = {}
        const currDebtPeriodRow = debtDataRows[i]
        const currDebtPeriodId = debtIdRows[i]
        payoutPeriod.amount = 0
        payoutPeriod.balance_amount = 0
        payoutPeriod.number_of_order = 0
        payoutPeriod.debt_period_id = currDebtPeriodId
        payoutPeriod.debt_period_start = currDebtPeriodRow.debt_period_start
        payoutPeriod.debt_period_end = currDebtPeriodRow.debt_period_end
        payoutPeriod.payout_period_start = genPayoutPeriodStart(
            currDebtPeriodRow.debt_period_end
        )
        payoutPeriod.payout_period_end = genPayoutPeriodEnd(
            payoutPeriod.payout_period_start
        )
        payoutPeriod.key = genPayoutPeriodKey(payoutPeriod)
        payoutPeriods.push(payoutPeriod)
    }
    await insertPayoutPeriod(payoutPeriods)
}
