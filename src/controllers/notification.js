const Joi = require('joi')
const { isEmpty } = require('lodash')
const OnesignalService = require('../services/onesignal.service')
const { parseOption } = require('../utils/pagination')
const User = require('../models/user')
const Notification = require('../models/notification')
const { READ_STATUS, ACC_TYPE } = require('../constants')
const { arrayToMap } = require('../utils/common.util')
const { knex } = require('../connections/pg-general')

exports.subscribeWebpush = async (request) => {
    const { user } = request
    const { player_id } = await Joi.object()
        .keys({
            player_id: Joi.string().required(),
        })
        .validateAsync({ ...request.body })
    // await usersService.addOnesignalPlayerId({ user_id: user.id, player_id });
    if (player_id !== user.last_webpush_player_id) {
        if (user.last_webpush_player_id)
            await OnesignalService.removelAllTagTagByPlayerId(
                user.last_webpush_player_id
            )
        await User.updateUserById(user.id, {
            last_webpush_player_id: player_id,
        })
    }
    await OnesignalService.addTagByUser({ user_id: user.id, player_id })

    return {
        is_success: true,
        data: {
            player_id,
            last_webpush_player_id: user.last_webpush_player_id,
        },
    }
}

exports.getNotifications = async (request) => {
    const { user } = request
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            type: Joi.valid('common', 'product', 'transaction', 'order'),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const option = parseOption(request.query)
    option.user_id = user.id
    query.created_at = user.created_at
    option.tenant_id = user.tenant_id

    const data = await Notification.getNotifications(option, query)

    data.data = data.data.map((item) => {
        if (item.read_status === null) {
            item.read_status = 'unread'
        }

        return item
    })

    return {
        is_success: true,
        ...data,
    }
}

exports.adminGetNotifications = async (request) => {
    const { user } = request
    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            source: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const option = parseOption(request.query)
    option.tenant_id = user.tenant_id
    // is_common_message === true
    // query.is_common_message = true
    query.type = 'common'
    const data = await Notification.adminGetNotifications(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.adminUpdateMessage = async (request) => {
    const { id, read_status } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            read_status: Joi.string().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const message = await Notification.getMessageVsUserByIdById(id)

    if (!message) throw new Error('message_is_not_found')

    await Notification.updateMessageVsUserById(id, { read_status })

    if (read_status === READ_STATUS.READ) {
        const user = await User.getUserById(message.user_id)
        await User.updateUserById(message.user_id, {
            num_new_message: user.num_new_message - 1,
        })
    }

    return {
        is_success: true,
    }
}

exports.updateMessage = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const read_status = READ_STATUS.READ

    const messageUser = await Notification.getMessageVsUser({
        message_id: id,
        user_id: user.id,
    })

    const message = await Notification.getMessage({ id })

    if (!messageUser && !message) throw new Error('notification_is_not_found')

    if (!messageUser && message) {
        await Notification.insertMessageVsUser({
            read_status,
            message_id: id,
            user_id: user.id,
        })
    } else {
        await Notification.updateMessageVsUser(
            { id: messageUser.id },
            { read_status }
        )
        // const userInfo = await User.getUserById(message.user_id)

        // await User.updateUserById(message.user_id, {
        //     num_new_message: userInfo.num_new_message - 1,
        // })
    }

    return {
        is_success: true,
    }
}

exports.updateAllMessage = async (request) => {
    const { user } = request

    const { message_ids } = await Joi.object()
        .keys({
            message_ids: Joi.array().items().required(),
        })
        .validateAsync(
            { ...request.body },
            { stripUnknown: false, allowUnknown: true }
        )
    const read_status = READ_STATUS.READ

    await knex.transaction(async (trx) => {
        // eslint-disable-next-line no-restricted-syntax
        for (const message_id of message_ids) {
            // eslint-disable-next-line no-await-in-loop
            await Notification.updateMessageVsUserById(
                message_id,
                {
                    read_status,
                },
                { trx }
            )
        }
    })

    return {
        is_success: true,
    }
}

exports.getCountNotifications = async (request) => {
    const { user } = request
    const { ...query } = await Joi.object()
        .keys({
            read_status: Joi.string().default(READ_STATUS.UNREAD),
        })
        .validateAsync(request.query, {
            stripUnknown: false,
            allowUnknown: true,
        })

    const option = {}

    option.user_id = user.id

    option.tenant_id = user.tenant_id

    query.created_at = user.created_at
    const notifications = await Notification.countNotificationByUserId(
        option,
        query
    )
    console.log(
        '🚀 ~ file: notification.js ~ line 170 ~ exports.sellerGetCountNotifications= ~ notifications',
        notifications
    )
    const statsMap = arrayToMap(notifications, 'type')

    const getByKey = (key, isAbs = false) =>
        isAbs
            ? Math.abs(statsMap.get(key)?.count ?? 0 * 1)
            : statsMap.get(key)?.count ?? 0 * 1

    const total_common = getByKey('common')
    const total_products = getByKey('product')
    const total_orders = getByKey('order')
    const total_transactions = getByKey('transaction')
    const total_notifications =
        getByKey('common', true) +
        getByKey('product', true) +
        getByKey('order', true) +
        getByKey('transaction', true)

    const data = {
        total_noti_common: Math.abs(total_common),
        total_noti_products: Math.abs(total_products),
        total_noti_orders: Math.abs(total_orders),
        total_noti_transactions: Math.abs(total_transactions),
        total_notifications,
    }

    return {
        is_success: true,
        data,
    }
}

exports.adminGetDetailNotifications = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Notification.getMessageById(id)

    if (!data) {
        throw new Error('New_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.adminCreateNotifications = async (request) => {
    const { user } = request
    if (user.account_type !== ACC_TYPE.ADMIN)
        throw new Error('user_is_not_a_admin')
    const { user_ids, ...value } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            short_description: Joi.string(),
            content: Joi.string(),
            source: Joi.string(),
            metadata: Joi.object().allow(null),
            user_ids: Joi.array().allow(null),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.status = 'active'
    value.type = 'common'
    value.is_common_message = false
    value.tenant_id = user.tenant_id

    if (isEmpty(user_ids)) {
        value.is_common_message = true
    }

    await knex.transaction(async (trx) => {
        const [id] = await Notification.insertMessage(value, { trx })
        if (user_ids) {
            // eslint-disable-next-line no-restricted-syntax
            for (const user_id of user_ids) {
                // eslint-disable-next-line no-await-in-loop
                await Notification.insertMessageVsUser(
                    { user_id, message_id: id, read_status: 'unread' },
                    { trx }
                )
            }
        }
    })

    return {
        is_success: true,
    }
}
exports.adminDeleteNotifications = async (request) => {
    const { ids } = await Joi.object()
        .keys({
            ids: Joi.array().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    await Notification.deleteMessage(ids)

    return {
        is_success: true,
    }
}
