const MyOnsignalClient = require('../connections/onesignal')
const {
    EMPTY_ALL_ONESIGNAL_TAGS,
    ROLE_NAME_TO_ADMIN_TAG,
} = require('../constants/onesignal')
const User = require('../models/user')

exports.removelAllTagTagByPlayerId = (playerId) =>
    MyOnsignalClient.editDevice(playerId, {
        tags: EMPTY_ALL_ONESIGNAL_TAGS,
    })
        .then((res) => console.log('remove tag res = ', res.body))
        .catch((err) =>
            console.error('removelAllTagTagByUser>editDevice error : ', err)
        )

exports.addTagByUser = async ({ user_id, player_id }) => {
    const userData = await User.getUserPartnerRoles(user_id)

    const tags = userData.roles.reduce((result, item) => {
        const itemTitle = ROLE_NAME_TO_ADMIN_TAG[item.title]

        if (itemTitle) result[itemTitle] = '1'

        return result
    }, {})

    // const tags = Object.assign(
    //     {},
    //     ...(userData.roles || []).map((role) => ({
    //         [ROLE_NAME_TO_TAG[role.title]]: '1',
    //     }))
    // )

    return MyOnsignalClient.editDevice(player_id, {
        tags,
    }).catch((err) => {
        let parseError = err.body
        if (parseError) {
            parseError = JSON.parse(parseError)
            if (parseError.errors) parseError = parseError.errors.join(', ')
        }
        throw new Error(parseError)
    })
}

exports.pushMesToAdminOrderHandler = ({ message }) => {
    console.log('run pushMesToAdminOrderHandler')
    const notification = {
        contents: {
            en: message,
        },
        headings: {
            en: 'Odii Notification',
        },
        included_segments: ['Order Handler'],
        // url: `${ADMIN_URL}/orders/${order.id}`,
    }
    MyOnsignalClient.createNotification(notification).catch((err) =>
        console.error('Send mes error = ', err)
    )
}

exports.pushMessage = ({ message, segment, url, data }) => {
    console.log('🚀 ~ file: onesignal.service.js ~ line 56 ~ message', message)

    console.log('run push message to admin')
    const notification = {
        contents: {
            en: message,
        },
        headings: {
            en: 'Odii Notification',
        },
        included_segments: [`${segment}`],
        url,
        // filters: [
        //     {
        //         field: 'tag',
        //         key: 'account_type',
        //         relation: '=',
        //         value: `${account_type}`,
        //     },
        // ],
    }
    MyOnsignalClient.createNotification(notification).catch((err) =>
        console.error('Send mes error = ', err)
    )
}
