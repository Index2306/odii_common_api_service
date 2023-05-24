/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
import Logger from '../logger'

const _ = require('lodash')
const axios = require('axios')

const { INTERNAL_SECRET, SALE_CHANNEL_SERVICE } = require('../config')
const AppError = require('../utils/app-error')

const tiktokInternalClient = axios.create({
    baseURL: SALE_CHANNEL_SERVICE,
    timeout: 30000,
    headers: {
        Authorization: INTERNAL_SECRET,
    },
})

function basePost(url, data, options = {}) {
    return tiktokInternalClient
        .post(url, data)
        .then((response) => {
            console.log(JSON.stringify(response.data))

            const resData = response.data
            if (!resData.is_success) return

            return response.data?.data
        })
        .catch((error) => {
            // console.log('url = ', url)
            // console.log(error.message)
            const resData = error.response?.data
            console.log(resData)
            Logger.error(
                `[tiktokInternalClient] url=${url} resData=${JSON.stringify(
                    resData
                )}`,
                error
            )

            if (error?.code === 'ECONNABORTED') {
                throw new AppError('delete_tiktok_fail', {
                    message:
                        'Không thể kết nối tới shop tiktok. Vui lòng thử lại hoặc liên hệ hỗ trợ',
                })
            }
            if (options.return_null_on_err) return

            // error_code: 'token_not_found'
            if (resData.error_code === 'token_not_found')
                throw new AppError('invalid_sale_channel_access_token', {
                    message:
                        'Không thể kết nối với tài khoản Lazada. Vui lòng kiểm trả lại tình trạng Cửa hàng hoặc liên hệ hỗ trợ',
                })

            // if (resData.error_code === 'LAZADA_ERROR_CODE_82')
            //     throw new AppError('LAZADA_ERROR_CODE_82', {
            //         message:
            //             'Đơn hàng đã được đóng hoặc đã sẵn sàng vận chuyển',
            //     })

            if (resData.error_code === 'TIKTOK_authorization is cancelled')
                throw new AppError('TIKTOK_authorization is cancelled', {
                    message:
                        'Kiểm tra lại Cửa hàng đã kết nối, vui lòng kết nối lại cửa hàng',
                })

            throw new AppError(resData.error_code, {
                message:
                    resData.error_message ||
                    'Không thể thực hiện, vui lòng liên hệ hỗ trợ',
            })
        })
}

// exports.lzdSetInvoiceNumber = async (data) =>
//     basePost('/internal/lazada/order/setInvoiceNumber', data)
//
// exports.lzdSetPack = async (data) =>
//     basePost('/internal/lazada/order/SetPack', data)
//
// exports.lzdSetRepack = async (data) =>
//     basePost('/internal/lazada/order/SetRepack', data)
//
// exports.lzdSetRTS = async (data) =>
//     basePost('/internal/lazada/order/SetStatusToReadyToShip', data)
//
// exports.lzdGetDocument = async (data) =>
//     basePost('/internal/lazada/order/GetDocument', data)
//
// exports.lzdGetShipmentProviders = async (data) =>
//     basePost('/internal/lazada/order/GetShipmentProviders', data)
//
// exports.lzdSetStatusToCanceled = async (data) =>
//     basePost('/internal/lazada/order/SetStatusToCanceled', data)
//
// exports.lzdGetStore = async (data) =>
//     basePost('/internal/lazada/store/GetStoreInfo', data, {
//         return_null_on_err: true,
//     })
//

exports.tikTokPushStoreProduct = async (data) =>
    basePost('/internal/tiktok/product/CreateProduct', data)

exports.tikTokUpdateProduct = async (data) =>
    basePost('/internal/tiktok/product/updateProduct', data, {
        return_null_on_err: true,
    })

exports.tikTokDeleteProduct = async (data) =>
    basePost('/internal/tiktok/product/DeleteProduct', data)

exports.tiktokSyncAllProductOfStore = async (data) =>
    basePost('/internal/tiktok/store/SyncAllProducts', data)
exports.tiktokSyncStoreWarehouse = async (data) =>
    basePost('/internal/tiktok/store/SyncWarehouse', data)

exports.tikTokGetRejectReasons = async (data) =>
    basePost('/internal/tiktok/order/GetRejectReasons', data)
exports.tikTokCancelOrder = async (data) =>
    basePost('/internal/tiktok/order/CancelOrder', data)

exports.tiktokSetRTS = async (data) =>
    basePost('/internal/tiktok/order/SetStatusToReadyToShip', data)

exports.tiktokPrintOrder = async (data) =>
    basePost('/internal/tiktok/order/printOrder', data)
