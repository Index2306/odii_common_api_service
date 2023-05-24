const _ = require('lodash')
const { knex } = require('../connections/pg-general')
const Notification = require('../models/notification')
const User = require('../models/user')

exports.sendMessage = async (
    user_id,
    {
        type,
        status,
        partner_id,
        arrReceiver,
        source,
        content,
        data_id,
        metadata,
    }
) => {
    await knex.transaction(async (trx) => {
        if (!_.isEmpty(arrReceiver)) {
            arrReceiver.map(async (receiver_id) => {
                const [idMessage] = await Notification.insertMessage(
                    {
                        type,
                        is_common_message: false,
                        content,
                        status: 'active',
                        metadata,
                        name: `${type} notification`,
                        data_id,
                        to_partner_id: partner_id,
                        to_user_id: receiver_id,
                        source: source || 'all',
                        created_by: user_id,
                    },
                    { trx }
                )
                await Notification.insertMessageVsUser(
                    {
                        message_id: idMessage,
                        user_id: receiver_id,
                        read_status: 'unread',
                    },
                    { trx }
                )
                const infoUser = await User.getUserById(receiver_id)

                await User.updateUserById(receiver_id, {
                    num_new_message: infoUser.num_new_message + 1,
                })
            })
        }
    })
}
