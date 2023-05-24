import moment from 'moment'
import Logger from '../logger'

const Joi = require('joi')
const Store = require('../models/store')
const Product = require('../models/product')
const Balance = require('../models/balance')
const { REDIS_KEY } = require('../constants')
const { redisClient } = require('../connections/redis-cache')
const { parseOption } = require('../utils/pagination')
const { SALE_CHANNEL_ARR } = require('../constants/index')
const LazadaInternalSvc = require('../services/lazada.service')
const ShopeeInternalSvc = require('../services/shopee.service')
const TikTokInternalSvc = require('../services/tiktok.service')
const AppError = require('../utils/app-error')
const { getStoreFullAddress } = require('../utils/common.util')

exports.adminGetStores = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await Store.getStoreListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerGetStores = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            platform: Joi.string()
                .allow(...SALE_CHANNEL_ARR)
                .only(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await Store.getStoreListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.sellerSyncAllProductOfStore = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const store = await Store.getOne({
        id,
        partner_id: user.partner_id,
    })

    if (!store) {
        Logger.error(
            '[sellerSyncAllProductOfStore] store_not_found',
            new Error('store_not_found')
        )
        throw new Error('store_not_found')
    }
    let syncTimeout = false
    if (store.last_sync_product_time) {
        const diff = moment.duration(
            moment().diff(store.last_sync_product_time)
        )
        syncTimeout = diff.asMinutes() > 10

        console.log('sync diff time', diff.asMinutes())
    }
    if (store.sync_product_status === 'pending' && !syncTimeout) {
        Logger.error(
            '[sellerSyncAllProductOfStore] sync_product_status === pending',
            new AppError('pending', {
                message: 'Sản phẩm đang đang được đồng bộ',
            })
        )

        throw new AppError('pending', {
            message: 'Sản phẩm đang đang được đồng bộ',
        })
    }

    const payloadData = {
        store_id: store.id,
    }

    if (store.platform === 'lazada') {
        Logger.info('[sellerSyncAllProductOfStore] Start sync LAZADA store')
        await LazadaInternalSvc.lzdSyncAllProductOfStore(payloadData)
    } else if (store.platform === 'shopee') {
        Logger.info('[sellerSyncAllProductOfStore] Start sync SHOPEE store')
        await ShopeeInternalSvc.shopeeSyncAllProductOfStore(payloadData)
    } else if (store.platform === 'tiktok') {
        Logger.info('[sellerSyncAllProductOfStore] Start sync TIKTOK store')
        await TikTokInternalSvc.tiktokSyncAllProductOfStore(payloadData)
    } else {
        Logger.error(
            '[sellerSyncAllProductOfStore] invalid_store_platform',
            new AppError('invalid_store_platform')
        )
        throw new AppError('invalid_store_platform')
    }

    return {
        is_success: true,
        message: 'Sản phầm đang bắt đầu được đồng bộ',
    }
}

exports.sellerSyncStoreAddress = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const store = await Store.getOne({ id, partner_id: user.partner_id })
    if (!store) {
        Logger.error(
            '[sellerSyncStoreAddress] store_not_found',
            new Error('store_not_found')
        )
        throw new Error('store_not_found')
    }
    if (store.partner_id !== user.partner_id)
        throw new Error('user have not this store')
    if (store.sync_address_status === 'pending') {
        Logger.error(
            '[sellerSyncStoreAddress] sync_address_status === pending',
            new AppError('pending', {
                message: 'Địa chỉ đang đang được đồng bộ',
            })
        )

        throw new AppError('pending', {
            message: 'Địa chỉ đang đang được đồng bộ',
        })
    }

    const payloadData = {
        store_id: store.id,
        partner_id: user.partner_id,
    }
    let res
    if (store.platform === 'lazada') {
        Logger.debug(
            `[sellerSyncStoreAddress] Start sync LAZADA store address payload=${JSON.stringify(
                payloadData
            )}}`
        )
        res = await LazadaInternalSvc.lzdSyncStoreWarehouse(payloadData)
    } else if (store.platform === 'tiktok') {
        Logger.debug(
            `[sellerSyncStoreAddress] Start sync TIKTOK store address payload=${JSON.stringify(
                payloadData
            )}}`
        )
        res = await TikTokInternalSvc.tiktokSyncStoreWarehouse(payloadData)
    } else if (store.platform === 'shopee') {
        Logger.debug(
            `[sellerSyncStoreAddress] Start sync SHOPEE store address payload=${JSON.stringify(
                payloadData
            )}}`
        )
        res = await ShopeeInternalSvc.shopeeSyncStoreWarehouse(payloadData)
    } else {
        Logger.error(
            '[sellerSyncAllProductOfStore] invalid_store_platform',
            new AppError('invalid_store_platform')
        )
        throw new AppError('invalid_store_platform')
    }
    if (res && !res.is_success) {
        throw new AppError(res.error_code, {
            message: res.error_message,
        })
    }

    return {
        is_success: true,
        message: 'Địa chỉ đã được đồng bộ',
    }
}

exports.updateStore = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            type: Joi.string(),
            status: Joi.string(),
            is_deleted: Joi.boolean(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const isExistStore = await Store.getStore(id)

    if (!isExistStore) {
        throw new Error('store id not found')
    }

    const data = await Store.updateStore(id, body)
    const is_success = data[0] !== 0

    return {
        is_success,
    }
}
exports.getStoreDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Store.getStore(id)

    if (!data) {
        throw new Error('store id not found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.sellerGetStoreDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Store.getStore(id)

    if (!data) {
        throw new Error('store id not found')
    }
    data.full_address = getStoreFullAddress(data.pickup_warehouse)
    data.full_address_return = getStoreFullAddress(data.return_warehouse)

    return {
        is_success: true,
        data,
    }
}
exports.sellerConnectStore = async (request) => {
    const { user } = request
    const { id, type } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            type: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )
    const store = await Store.getStore(id)
    if (!store) throw new Error('store id not found')

    if (store.partner_id !== user.partner_id)
        throw new Error('user have not this store')
    // let status
    const updateBody = {}
    if (type === 'disconnect') {
        // status = 'pending_for_disconnect'
        updateBody.status = 'inactive'
    } else if (type === 'delete') {
        // status = 'pending_for_delete'
        updateBody.status = 'inactive'
        updateBody.is_deleted = true
    } else {
        throw new Error('type is not valid')
    }

    await Store.updateStore(id, {
        ...updateBody,
        partner_id: user.partner_id,
        user_disconnect_at: new Date().toISOString(),
    })

    return {
        is_success: true,
    }
}

exports.sellerConnectPlatform = async (request) => {
    const { user } = request
    const sellerConnectData = await redisClient.getObject(
        `${REDIS_KEY.SELLER_CONNECT}_${user.partner_id}`
    )
    if (
        sellerConnectData &&
        sellerConnectData.connect_store &&
        sellerConnectData.find_product &&
        sellerConnectData.sell_product &&
        sellerConnectData.wallet_money
    )
        return {
            is_success: true,
            data: sellerConnectData,
        }

    const [countStore, countImportProduct, countProductOnSale, balanceUser] =
        await Promise.all([
            Store.countStoreByPartnerId(user.partner_id),
            Product.countImportProduct(user.partner_id),
            Product.countProductOnSale(user.partner_id),
            Balance.getPrimaryBalanceByPartner(user.partner_id),
        ])
    console.log(
        '🚀 ~ file: store.js ~ line 152 ~ exports.sellerConnectPlatform= ~ countProductOnSale',
        countProductOnSale
    )
    const data = {
        connect_store: true,
        find_product: true,
        sell_product: true,
        wallet_money: true,
    }
    if (!sellerConnectData?.connect_store) {
        data.connect_store = parseInt(countStore.count, 10) !== 0
    }
    if (!sellerConnectData?.find_product)
        data.find_product = parseInt(countImportProduct.count, 10) !== 0
    if (!sellerConnectData?.sell_product)
        data.sell_product = parseInt(countProductOnSale.count, 10) !== 0
    if (!sellerConnectData?.wallet_money)
        data.wallet_money = balanceUser && balanceUser.amount > 0

    redisClient.setObject(
        `${REDIS_KEY.SELLER_CONNECT}_${user.partner_id}`,
        data
    )

    return {
        is_success: true,
        data,
    }
}
