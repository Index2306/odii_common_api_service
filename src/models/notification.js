const { build } = require('joi')
const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getNotifications = async (options = {}, whereCondition) => {
    let query = knex
        .select(
            'message .*',
            knex.raw(
                `case  when (message_vs_user.read_status = 'read' and message_vs_user.user_id = ${options.user_id}) then 'read' else 'unread' end as read_status`
            )
        )
        .from('message')
        // .leftJoin('message_vs_user', 'message.id', 'message_vs_user.message_id')
        .leftJoin('message_vs_user', function () {
            this.on('message.id', '=', 'message_vs_user.message_id').andOn(
                knex.raw(`message_vs_user.user_id = ${options.user_id}`)
            )
        })
        .andWhere((builder) => {
            builder
                .where('message_vs_user.user_id', options.user_id)
                .orWhere('message.is_common_message', true)

            return builder
        })

    if (options.tenant_id)
        query = query.andWhere('message.tenant_id', options.tenant_id)

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.type) condition.type = whereCondition.type
        // if (whereCondition.is_common_message)
        //     condition.is_common_message = whereCondition.is_common_message
        if (whereCondition?.created_at) {
            query.andWhere('created_at', '>=', whereCondition.created_at)
        }

        query = query.andWhere(condition)
    }

    const result = await query
        .orderBy(options.order_by || 'created_at', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}
exports.adminGetNotifications = async (options = {}, whereCondition) => {
    let query = knex.select('message .*').from('message')

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.type) condition.type = whereCondition.type
        if (whereCondition.source) condition.source = whereCondition.source
        if (whereCondition.is_common_message)
            condition.is_common_message = whereCondition.is_common_message
        if (whereCondition?.created_at) {
            query.andWhere('created_at', '>=', whereCondition.created_at)
        }

        query = query.andWhere(condition)
    }

    if (options.tenant_id) {
        query = query.andWhere('tenant_id', options.tenant_id)
    }

    const result = await query
        .orderBy(options.order_by || 'created_at', options.order_direction)
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}

exports.insertMessageVsUser = (data, { trx } = {}) =>
    knex('message_vs_user', trx).insert(data).returning('id')

exports.insertMessage = (data, { trx } = {}) =>
    knex('message', trx).insert(data).returning('id')

exports.updateMessageVsUser = (condition, data, { trx } = {}) =>
    knex('message_vs_user', trx).update(data).where(condition)

exports.deleteMessage = (ids, { trx } = {}) =>
    getKnex('message', trx).whereIn('message.id', ids).del()

exports.updateMessageVsUserById = (message_id, data, { trx } = {}) =>
    exports.updateMessageVsUser({ message_id }, data, trx)

exports.updateMessageByUserId = (user_id, data, { trx } = {}) =>
    exports.updateMessageVsUser({ user_id }, data, trx)

exports.getMessageVsUser = (condition) =>
    knex.first().from('message_vs_user').where(condition)

exports.getMessageVsUserById = (id) => exports.getMessageVsUser({ id })

exports.getMessage = (condition) =>
    knex.first().from('message').where(condition)

exports.getMessageById = (id) => exports.getMessage({ id })

exports.countNotificationByUserId = async (options, whereCondition) => {
    const query = knex
        .select(
            'message.type',
            knex.raw(
                `count(1)                                         AS count`
            )
        )
        // knex.raw(`case  when (message_vs_user.read_status = 'read' and message_vs_user.user_id = ${options.user_id}) then 'read' else 'unread' end as read_status`))
        .from('message')
        // .leftJoin('message_vs_user', 'message.id', 'message_vs_user.message_id')
        .leftJoin('message_vs_user', function () {
            this.on('message.id', '=', 'message_vs_user.message_id').andOn(
                knex.raw(`message_vs_user.user_id = ${options.user_id}`)
            )
        })
        .where((builder) => {
            builder
                .where('message_vs_user.user_id', options.user_id)
                .orWhere('message.is_common_message', true)

            return builder
        })
        .andWhere((builder) => {
            if (whereCondition.read_status === 'read') {
                builder
                    .where('message_vs_user.read_status', 'read')
                    .andWhere('message_vs_user.user_id', options.user_id)
            } else {
                builder
                    .where('message_vs_user.read_status', '=', 'unread')
                    .orWhereNull('message_vs_user.read_status')
            }

            return builder
        })
        .andWhere('created_at', '>=', whereCondition.created_at)

    if (options.tenant_id) {
        query.andWhere('message.tenant_id', options.tenant_id)
    }
    query.groupBy('type')

    return query
}
