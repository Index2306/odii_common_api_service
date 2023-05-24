const OneSignal = require('onesignal-node')
const { ONESIGNAL_API_KEY, ONESIGNAL_APPID } = require('../config')

const client = new OneSignal.Client(ONESIGNAL_APPID, ONESIGNAL_API_KEY)

// exports.getUserClient = (token) => new OneSignal.UserClient(token)
module.exports = client
