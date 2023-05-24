const moment = require('moment-timezone')
const { v4: uuidv4 } = require('uuid')
const _ = require('lodash')
const {
    DEBT_TIME_ZONE,
    DEBT_BEGIN_TIME,
    DEBT_PERIOD_TIME_DAYS,
    PAYOUT_PERIOD_TIME_DAYS,
} = require('../config')
const { genDebtPeriodKey } = require('../models/debt-period')
const {
    genPayoutPeriodKey,
    genPayoutPeriodStart,
    genPayoutPeriodEnd,
} = require('../models/payout-period')

exports.parseTimestampForQuery = (stringDate, timezone) => {
    const outputIsoTime = moment(stringDate, 'YYYY-MM-DD')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()

    return outputIsoTime
}

exports.parseIsoString = (stringDate) => {
    const outputIsoTime = moment(
        stringDate.replace(/[ ]/g, '+'),
        moment.ISO_8601
    )
        .utc()
        .toISOString()

    return outputIsoTime
}

/**
 * @param {*} timezone
 * @returns a object: {startTime: Moment, endTime: Moment}
 */
const getCurrentDebtPeriodTime = (
    timezone = 'Asia/Ho_Chi_Minh',
    now = undefined
) => {
    const currentDebtPeriodTime = {}
    const currTime = now || moment()
    const debtBeginTime = moment.tz(DEBT_BEGIN_TIME, DEBT_TIME_ZONE)
    const diffDay = currTime.diff(debtBeginTime, 'days')
    const currPeriodNumber = Math.floor(diffDay / DEBT_PERIOD_TIME_DAYS)
    const currPeriodStartTime = debtBeginTime.add(
        currPeriodNumber * DEBT_PERIOD_TIME_DAYS,
        'days'
    )
    const currPeriodEndTime = currPeriodStartTime
        .clone()
        .add(DEBT_PERIOD_TIME_DAYS, 'days')
        .add(-1, 'seconds')
    // console.log('start', currPeriodStartTime.tz(timezone))
    // console.log('end', currPeriodEndTime.tz(timezone))
    currentDebtPeriodTime.startTime = currPeriodStartTime.tz(timezone)
    currentDebtPeriodTime.endTime = currPeriodEndTime.tz(timezone)
    const { startTime: debt_period_start, endTime: debt_period_end } =
        currentDebtPeriodTime
    currentDebtPeriodTime.key = genDebtPeriodKey({
        debt_period_start,
        debt_period_end,
    })

    return currentDebtPeriodTime
}

exports.getCurrentDebtPeriodTime = getCurrentDebtPeriodTime

exports.getNextPayoutPeriodTime = (timezone = 'Asia/Ho_Chi_Minh') => {
    const nextPayoutPeriodTime = {}
    const currDebtPeriod = getCurrentDebtPeriodTime(timezone)

    const nextPayoutPeriodStart = currDebtPeriod.endTime
        .clone()
        .add(1, 'seconds')
    const nextPayoutPeriodEnd = currDebtPeriod.endTime
        .clone()
        .add(PAYOUT_PERIOD_TIME_DAYS, 'days')

    nextPayoutPeriodTime.startTime = nextPayoutPeriodStart
    nextPayoutPeriodTime.endTime = nextPayoutPeriodEnd

    const { startTime: payout_period_start, endTime: payout_period_end } =
        nextPayoutPeriodTime
    nextPayoutPeriodTime.key = genPayoutPeriodKey({
        payout_period_start,
        payout_period_end,
    })

    return nextPayoutPeriodTime
}

const genPayoutPeriod = (debtPeriod) => {
    debtPeriod.payoutStartTime = genPayoutPeriodStart(debtPeriod.endTime)
    debtPeriod.payoutEndTime = genPayoutPeriodEnd(debtPeriod.payoutStartTime)
    const {
        payoutStartTime: payout_period_start,
        payoutEndTime: payout_period_end,
    } = debtPeriod
    debtPeriod.payoutPeriodKey = genPayoutPeriodKey({
        payout_period_start,
        payout_period_end,
    })
}
exports.genPayoutPeriod = genPayoutPeriod

const genPrevDebtPeriodTime = (debtPeriodTime) => {
    const prevDebtPeriodTime = {}
    prevDebtPeriodTime.endTime = debtPeriodTime.startTime
        .clone()
        .add(-1, 'seconds')
    prevDebtPeriodTime.startTime = prevDebtPeriodTime.endTime
        .clone()
        .add(-DEBT_PERIOD_TIME_DAYS, 'days')
        .add(1, 'seconds')

    const { startTime: payout_period_start, endTime: payout_period_end } =
        prevDebtPeriodTime
    prevDebtPeriodTime.key = genPayoutPeriodKey({
        payout_period_start,
        payout_period_end,
    })

    genPayoutPeriod(prevDebtPeriodTime)

    return prevDebtPeriodTime
}

exports.getListDebtPeriodTimeDesc = (
    limit = 10,
    timezone = 'Asia/Ho_Chi_Minh'
) => {
    const listDebtPeriod = []
    let currPeriodTime = getCurrentDebtPeriodTime(timezone)
    genPayoutPeriod(currPeriodTime)
    for (let i = 0; i < limit; i += 1) {
        listDebtPeriod.push(currPeriodTime)
        currPeriodTime = genPrevDebtPeriodTime(currPeriodTime)
    }

    return listDebtPeriod
}
