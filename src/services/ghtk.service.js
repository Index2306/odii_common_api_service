/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
const axios = require('axios')

const { INTERNAL_SECRET, SALE_CHANNEL_SERVICE } = require('../config')
const AppError = require('../utils/app-error')

const ghtkInternalClient = axios.create({
    baseURL: SALE_CHANNEL_SERVICE,
    timeout: 30000,
    headers: {
        Authorization: INTERNAL_SECRET,
    },
})

function basePost(url, data, options = {}) {
    return ghtkInternalClient
        .post(url, data)
        .then((response) => {
            console.log("ghtk response = ",JSON.stringify(response.data))

            return response.data
        })
        .catch((error) => {
            console.log('url = ', error)
            // console.log(error.message)
            const resData = error.response?.data
            console.log("ghtk err ",resData)
            if (options.return_null_on_err) return

            // error_code: 'token_not_found'
            if (resData?.message) {
                throw new AppError('invalid_sale_channel_access_token', {
                    message:
                        'Không thể kết nối với tài khoản giao hàng tiết kiệm. Vui lòng kiểm trả lại tình trạng Cửa hàng hoặc liên hệ hỗ trợ',
                })
            }


            throw new AppError(resData?.message || 'request_ghtk_err', {
                message:
                    resData?.message ||
                    'Không thể thực hiện, vui lòng liên hệ hỗ trợ',
            })
        })
}

exports.ghtkGetTransportFee = async (data) =>
    basePost('/internal/ghtk/order/GetTransportFee', data)

exports.GHTKSetRTS = async (data) =>
    basePost('/internal/ghtk/order/SetRTS', data)

exports.ghtkCancelOrder = async (data) =>
    basePost('/internal/ghtk/order/CancelOrderGHTK', data)

exports.ghtkPrintLabel = async (data) =>
    basePost('/internal/ghtk/order/PrintLabelGHTK', data)