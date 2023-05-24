/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
const axios = require('axios')

const { INTERNAL_SECRET, SALE_CHANNEL_SERVICE } = require('../config')
const AppError = require('../utils/app-error')

const shopeeInternalClient = axios.create({
    baseURL: SALE_CHANNEL_SERVICE,
    timeout: 30000,
    headers: {
        Authorization: INTERNAL_SECRET,
    },
})

const basePost = async (url, data, options = {}) =>
    new Promise((resolve) =>
        shopeeInternalClient
            .post(url, data, options)
            .then((response) => {
                if (options.responseType) {
                    resolve(response.data)
                } else {
                    resolve(response.data.response)
                }
            })
            .catch((error) => {
                const systemError = {
                    error_code: 'request to shopee channel failure',
                    error_message:
                        'Không thể kết nối đến shopee, vui lòng thử lại sau',
                }
                console.log('error', error)
                const errorResponse = error?.response?.data || systemError
                resolve(errorResponse)
            })
    )

exports.getShippingParameter = async (data) =>
    basePost('/internal/shopee/logistic/getShippingParameter', data, {
        // return_null_on_err: true,
    })

exports.shipOrderAndCreateDocument = async (data) =>
    basePost('/internal/shopee/logistic/shipOrderAndCreateDocument', data, {
        // return_null_on_err: true,
    })

exports.downloadShippingDocument = async (data) =>
    basePost('/internal/shopee/logistic/downloadShippingDocument', data, {
        responseType: 'arraybuffer',
    })

exports.shopeeSyncAllProductOfStore = async (data) =>
    basePost('/internal/shopee/store/SyncAllProducts', data)

exports.shopeeSyncStoreWarehouse = async (data) =>
    basePost('/internal/shopee/store/SyncWarehouse', data)

exports.shopeeCancelOrder = async (data) =>
    basePost('/internal/shopee/order/cancel_order', data)
