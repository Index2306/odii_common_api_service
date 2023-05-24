/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
const _ = require('lodash')
const axios = require('axios')

const { INTERNAL_SECRET, SALE_CHANNEL_SERVICE } = require('../config')
const AppError = require('../utils/app-error')

const lazInternalClient = axios.create({
    baseURL: SALE_CHANNEL_SERVICE,
    timeout: 30000,
    headers: {
        Authorization: INTERNAL_SECRET,
    },
})

function basePost(url, data, options = {}) {
    return lazInternalClient
        .post(url, data)
        .then((response) => {
            console.log(JSON.stringify(response.data))

            const resData = response.data
            if (!resData.is_success) return

            return response.data?.data
        })
        .catch((error) => {
            console.log('url = ', url)
            // console.log(error.message)
            const resData = error.response?.data
            console.log(resData)
            if (options.return_null_on_err) return

            // error_code: 'token_not_found'
            if (resData.error_code === 'token_not_found')
                throw new AppError('invalid_sale_channel_access_token', {
                    message:
                        'Không thể kết nối với tài khoản Lazada. Vui lòng kiểm trả lại tình trạng Cửa hàng hoặc liên hệ hỗ trợ',
                })

            if (resData.error_code === 'LAZADA_ERROR_CODE_82')
                throw new AppError('LAZADA_ERROR_CODE_82', {
                    message:
                        'Đơn hàng đã được đóng hoặc đã sẵn sàng vận chuyển',
                })

            throw new AppError(resData.error_code || 'request_lzd_err', {
                message:
                    resData.error_message ||
                    'Không thể thực hiện, vui lòng liên hệ hỗ trợ',
            })
        })
}

exports.lzdMoatLogin = async (data) => {
    if (!data?.ati) return

    return lazInternalClient
        .post('/internal/lazada/datamoat/login', data)
        .then((response) => {
            console.log(JSON.stringify(response.data))
        })
        .catch((error) => {
            console.log(error.response?.data)
            throw error
        })
}

exports.lzdMoatComputeRisk = async (data) => {
    if (!data?.ati) return

    return lazInternalClient
        .post('/internal/lazada/datamoat/risk', data)
        .then((response) => {
            console.log(JSON.stringify(response.data))
            const lazadaResult = response?.data?.result
            if (!lazadaResult.success) throw new Error(lazadaResult?.riskType)
        })
        .catch((error) => {
            console.log(error.response?.data)
        })
}

exports.lzdSetInvoiceNumber = async (data) =>
    basePost('/internal/lazada/order/setInvoiceNumber', data)

exports.lzdSetPack = async (data) =>
    basePost('/internal/lazada/order/SetPack', data)

exports.lzdSetRepack = async (data) =>
    basePost('/internal/lazada/order/SetRepack', data)

exports.lzdSetRTS = async (data) =>
    basePost('/internal/lazada/order/SetStatusToReadyToShip', data)

exports.lzdGetDocument = async (data) =>
    basePost('/internal/lazada/order/GetDocument', data)

exports.lzdGetShipmentProviders = async (data) =>
    basePost('/internal/lazada/order/GetShipmentProviders', data)

exports.lzdSetStatusToCanceled = async (data) =>
    basePost('/internal/lazada/order/SetStatusToCanceled', data)

exports.lzdGetStore = async (data) =>
    basePost('/internal/lazada/store/GetStoreInfo', data, {
        return_null_on_err: true,
    })

exports.lzdSyncAllProductOfStore = async (data) =>
    basePost('/internal/lazada/store/SyncAllProducts', data)

exports.lzdPushStoreProduct = async (data) =>
    basePost('/internal/lazada/product/CreateProduct', data)

exports.lzdUpdateProduct = async (data) =>
    basePost('/internal/lazada/product/updateProduct', data, {
        return_null_on_err: true,
    })
exports.lzdSyncStoreWarehouse = async (data) =>
    basePost('/internal/lazada/store/SyncWarehouse', data)
// Get reject reasons cancel order
exports.lzdGetRejectReasons = async (data) =>
    basePost('/internal/lazada/order/GetRejectReasons', data)

// store_product_id, platform_shop_id
exports.shopeePushStoreProduct = async (data) =>
    basePost('/internal/shopee/product/CreateProduct', data)

// setTimeout(async (data) => {
//     console.log('2222 lzdGetStore')
//     const result = await exports.lzdGetStore({ store_id: '2' })
//     console.log('result = ', result)
// }, 2000)
