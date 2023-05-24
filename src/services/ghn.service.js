/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
import Logger from '../logger'
const axios = require('axios')

const { INTERNAL_SECRET, SALE_CHANNEL_SERVICE } = require('../config')
const AppError = require('../utils/app-error')

const ghnInternalClient = axios.create({
    baseURL: SALE_CHANNEL_SERVICE,
    timeout: 30000,
    headers: {
        Authorization: INTERNAL_SECRET,
    },
})

function basePost(url, data, options = {}) {
    return ghnInternalClient
        .post(url, data)
        .then((response) => {
            console.log("ghn response = ",JSON.stringify(response.data))

            return response.data
        })
        .catch((error) => {
            Logger.debug(`[GHN_SYNC_API] check error=${JSON.stringify(error)}`)
            console.log('url = ', error)
            // console.log(error.message)
            const resData = error.response?.data
            console.log("ghn err ",resData)
            if (options.return_null_on_err) return

            // error_code: 'token_not_found'
            if (resData?.message) {
                throw new AppError('invalid_sale_channel_access_token', {
                    message:
                        'Không thể kết nối với tài khoản giao hàng tiết kiệm. Vui lòng kiểm trả lại tình trạng Cửa hàng hoặc liên hệ hỗ trợ',
                })
            }


            throw new AppError(resData?.message || 'request_ghn_err', {
                message:
                    resData?.message ||
                    'Không thể thực hiện, vui lòng liên hệ hỗ trợ',
            })
        })
}

exports.ghnGetTransportFee = async (data) =>
    basePost('/internal/ghn/order/GetTransportFee', data)

exports.ghnSetRTS = async (data) =>
    basePost('/internal/ghn/order/SetRTS', data)

exports.ghnCancelOrder = async (data) =>
    basePost('/internal/ghn/order/CancelOrderGHN', data)

exports.ghnPrintLabel = async (data) =>
    basePost('/internal/ghn/order/PrintLabelGHN', data)