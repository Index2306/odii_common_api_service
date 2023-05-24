/* eslint-disable consistent-return */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-bitwise */
/* eslint-disable no-param-reassign */
// eslint-disable-next-line import/no-unresolved
const { customAlphabet, nanoid } = require('nanoid')
const moment = require('moment-timezone')
const { v4: uuidv4 } = require('uuid')
const _ = require('lodash')
const {
    LANDING_URL,
    SELLER_URL,
    SUPPLIER_URL,
    ADMIN_URL,
    STATIC_HOST,
} = require('../config')
const { ACC_TYPE, TRANSACTION_FILTER } = require('../constants')

const nanoidBarcode = customAlphabet('0123456789', 13)
const nanoidTransCode = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    15
)

const nanoidProductSKU = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    15
)

const nanoidWarehouseImportCode = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    15
)

exports.getBarcode = () => nanoidBarcode()
exports.getTransactionCode = () => nanoidTransCode()
exports.getProductSKU = () => `ODII-${nanoidProductSKU()}`
exports.getWarehouseImportCode = () => `ODII-${nanoidWarehouseImportCode()}`

exports.getUuid = () => uuidv4().replace(/-/g, '')

exports.getOrderCode = () => nanoid(13)

exports.getOrderItemCode = () => nanoid(15)

// https://en.wikipedia.org/wiki/Feistel_cipher
const feistelCipher = (seed, id) => {
    if (seed >= 2 ** 30) {
        throw new Error('Seed for unique code is out of range')
    }

    const round = function (input) {
        return ((seed * input + 150889) % 714025) / 714025.0
    }

    id = Number(id)

    let l1 = (id >> 15) & 32767
    let r1 = id & 32767
    let l2
    let r2

    for (let i = 0; i < 3; i += 1) {
        l2 = r1
        r2 = l1 ^ (round(r1) * 32767)
        l1 = l2
        r1 = r2
    }

    return (r1 << 15) + l1
}

exports.getTransactionBankCode = (id) => {
    const random = Number(feistelCipher(1926, id))
    const random36 = random.toString(36).toUpperCase().padStart(6, '0')

    return `${random36.padStart(12, 'ODIIVN000000')}`
}

// console.log('getTransactionBankCode = ', exports.getTransactionBankCode(20000))

exports.trimText = (str) => str.trim().replace(/\s\s+/g, ' ')

exports.arrayToMap = (array, key) => {
    const map = new Map()
    for (const item of array) {
        map.set(item[key], item)
    }

    return map
}

exports.getSiteUrl = (source) => {
    let result
    switch (source) {
        case ACC_TYPE.SELLER:
            result = SELLER_URL
            break
        case ACC_TYPE.SUP:
            result = SUPPLIER_URL
            break
        case ACC_TYPE.ADMIN:
            result = ADMIN_URL
            break

        default:
            result = SELLER_URL
        // result = LANDING_URL
    }

    return result
}

exports.removeEmpty = (obj) =>
    _.pickBy(obj, (m) => m != null && !Number.isNaN(m) && m !== '')

exports.getImgUrl = (imgObj, options = {}) => {
    if (!imgObj?.location && !imgObj.origin) return
    if (!imgObj?.location && imgObj.origin) return imgObj.origin
    if (options.size)
        return `${STATIC_HOST}/${options.size}/${imgObj?.location}`

    return `${STATIC_HOST}/${imgObj?.location}`
}

exports.nonAccentVietnamese = (str) => {
    str = str.toLowerCase()
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i')
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
    str = str.replace(/đ/g, 'd')
    // Some system encode vietnamese combining accent as individual utf-8 characters
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '') // Huyền sắc hỏi ngã nặng
    str = str.replace(/\u02C6|\u0306|\u031B/g, '') // Â, Ê, Ă, Ơ, Ư

    return str
}

exports.getDates = (startDate, stopDate, timezone) => {
    const dateArray = []
    let currentDateMoment = moment(startDate).tz(timezone)
    const stopDateMoment = moment(stopDate).tz(timezone)
    while (currentDateMoment <= stopDateMoment) {
        dateArray.push(moment(currentDateMoment).format('DD/MM'))
        currentDateMoment = moment(currentDateMoment).add(1, 'days')
    }

    return dateArray
}
const checkOrder = (fulfillment_status, data) => {
    let count_order = 0
    const result = {}
    const order = _.find(data, {
        fulfillment_status,
    })
    if (order !== undefined) {
        count_order = parseInt(order.count_order)
    }
    result[`${fulfillment_status}`] = count_order

    return result
}
const checkTrans = (type, data) => {
    let count_transaction = 0
    const result = {}
    const transaction = _.find(data, {
        type,
    })
    if (transaction !== undefined) {
        count_transaction = parseInt(transaction.count)
    }
    result[`${type}`] = count_transaction

    return result
}

exports.mapOderWithStatus = (data) => {
    const fulfillment_status = [
        'pending',
        'fulfilled',
        'seller_confirmed',
        'seller_ignored',
        'seller_cancelled',
        'platform_cancelled',
        'sup_rejected',
    ]
    const result = {}
    let newOrder = {}
    // eslint-disable-next-line no-use-before-define
    fulfillment_status.map((item) => {
        const order = checkOrder(item, data)
        newOrder = Object.assign(newOrder, order)
    })
    if (newOrder) {
        result.order_new = newOrder.pending
        result.order_pending = newOrder.seller_confirmed
        result.order_success = newOrder.fulfilled
        result.order_cancelled =
            newOrder.sup_rejected +
            newOrder.platform_cancelled +
            newOrder.seller_cancelled
    }

    const sum = data.reduce(
        (total, currentValue) => total + parseInt(currentValue.count_order, 10),
        0
    )

    result.count_total_order = sum

    return result
}

exports.genVariationName = (variation) =>
    _.compact([
        variation.option_1,
        variation.option_2,
        variation.option_3,
    ]).join(' ')

exports.mapTransactionWithStatus = (data) => {
    const type = [
        TRANSACTION_FILTER.DEPOSIT,
        TRANSACTION_FILTER.WITHDRAWAL,
        TRANSACTION_FILTER.PAY,
        TRANSACTION_FILTER.RECEIVE,
    ]
    const result = {}
    let newTransaction = {}
    // eslint-disable-next-line no-use-before-define
    type.map((item) => {
        const transaction = checkTrans(item, data)
        newTransaction = Object.assign(newTransaction, transaction)
    })
    if (newTransaction) {
        result.request_transaction_deposit = newTransaction.deposit
        result.request_transaction_pay = newTransaction.pay
        result.request_transaction_receive = newTransaction.receive
        result.request_transaction_withdraw = newTransaction.withdrawal
    }

    const sum = data.reduce(
        (total, currentValue) => total + parseInt(currentValue.count, 10),
        0
    )

    result.count_total_transactions = sum

    return result
}
exports.formatVND = (n) => {
    const val = (n / 1).toFixed(0).replace(',', '.')

    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
exports.convertDebtDay = (d) => {
    if (!d) return ''
    const arr = d.split('_').map((item) => moment(item).format('DD/MM/YYYY'))

    return `${arr[0]}-${arr[1]}`
}

exports.parseNumber = (num) => num * 1 || 0

exports.normalizeObj = (obj) => {
    const result = {}
    for (const attr in obj) {
        if (obj[attr] !== undefined) {
            result[attr] = obj[attr]
        }
    }

    return result
}
exports.getStoreFullAddress = (storeAddress) => {
    if (!storeAddress) return ''
    const arr = [
        storeAddress.detail_address,
        storeAddress.ward_name,
        storeAddress.district_name,
        storeAddress.province_name,
    ]
    const ret = arr.filter((item) => item).join(', ')

    return ret
}
exports.normalStoreAddress = (storeAddress) => {
    if (!storeAddress) return ''
    const arr = []
    if (storeAddress.ward_name) {
        let tmp = exports.nonAccentVietnamese(
            storeAddress.ward_name.toLowerCase()
        )
        tmp = tmp.replace('phuong', '')
        tmp = tmp.replace('xa', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    if (storeAddress.district_name) {
        let tmp = exports.nonAccentVietnamese(
            storeAddress.district_name.toLowerCase()
        )
        tmp = tmp.replace('quan', '')
        tmp = tmp.replace('huyen', '')
        tmp = tmp.replace('city', '')
        tmp = tmp.replace('thanh pho', '')
        tmp = tmp.replace('district', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    if (storeAddress.province_name) {
        let tmp = exports.nonAccentVietnamese(
            storeAddress.province_name.toLowerCase()
        )
        tmp = tmp.replace('tinh', '')
        tmp = tmp.replace('city', '')
        tmp = tmp.replace('province', '')
        tmp = tmp.replace('tp.', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    const ret = arr.filter((item) => item).join(', ')

    return ret
}
exports.getLocationFullAddress = (location) => {
    if (!location) return ''
    const add = location.address1 ?? location.address2
    const arr = [
        add,
        location.ward_name,
        location.district_name,
        location.province,
    ]
    const ret = arr.filter((item) => item).join(', ')

    return ret
}
exports.normalLocaltion = (location) => {
    if (!location) return ''
    const arr = []
    if (location.ward_name) {
        let tmp = exports.nonAccentVietnamese(location.ward_name.toLowerCase())
        tmp = tmp.replace('phuong', '')
        tmp = tmp.replace('xa', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    if (location.district_name) {
        let tmp = exports.nonAccentVietnamese(
            location.district_name.toLowerCase()
        )
        tmp = tmp.replace('quan', '')
        tmp = tmp.replace('huyen', '')
        tmp = tmp.replace('city', '')
        tmp = tmp.replace('thanh pho', '')
        tmp = tmp.replace('district', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    if (location.province) {
        let tmp = exports.nonAccentVietnamese(location.province.toLowerCase())
        tmp = tmp.replace('tinh', '')
        tmp = tmp.replace('city', '')
        tmp = tmp.replace('province', '')
        tmp = tmp.replace('tp.', '')
        tmp = tmp.replace(/\s/g, '')
        arr.push(tmp.trim())
    }
    const ret = arr.filter((item) => item).join(', ')

    return ret
}
