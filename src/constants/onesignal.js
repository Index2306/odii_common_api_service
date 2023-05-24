/* eslint-disable no-unused-vars */
const _ = require('lodash')
const crypto = require('crypto')
const { ROLES } = require('./index')

const ONESIGNAL_ROLE_TAGS_SALT = 'odiisida'

exports.ONESIGNAL_ROLE_TAGS = _(ROLES)
    .mapValues(
        (value, key) =>
            `${value}_${crypto
                .createHash('sha1')
                .update(value + ONESIGNAL_ROLE_TAGS_SALT)
                .digest('hex')}`
    )
    .value()

exports.EMPTY_ALL_ONESIGNAL_TAGS = Object.assign(
    {},
    ..._.values(exports.ONESIGNAL_ROLE_TAGS).map((item) => ({ [item]: '' }))
)

exports.ROLE_NAME_TO_TAG = {
    super_admin: exports.ONESIGNAL_ROLE_TAGS.SUPER_ADMIN,
    admin_product: exports.ONESIGNAL_ROLE_TAGS.ADMIN_PRODUCT,
    admin_order: exports.ONESIGNAL_ROLE_TAGS.ADMIN_ORDER,
    admin_user: exports.ONESIGNAL_ROLE_TAGS.ADMIN_USER,
    admin_balance: exports.ONESIGNAL_ROLE_TAGS.ADMIN_BALANCE,
    owner: exports.ONESIGNAL_ROLE_TAGS.OWNER,
    partner_product: exports.ONESIGNAL_ROLE_TAGS.PARTNER_PRODUCT,
    partner_order: exports.ONESIGNAL_ROLE_TAGS.PARTNER_ORDER,
    partner_balance: exports.ONESIGNAL_ROLE_TAGS.PARTNER_BALANCE,
    admin_chief_accountant: exports.ONESIGNAL_ROLE_TAGS.CHIEF_ACCOUNTANT,
    admin_accountant: exports.ONESIGNAL_ROLE_TAGS.ACCOUNTANT,
    partner_member: exports.ONESIGNAL_ROLE_TAGS.PARTNER_MEMBER,
    partner_store: exports.ONESIGNAL_ROLE_TAGS.PARTNER_STORE,
}

exports.ROLE_NAME_TO_ADMIN_TAG = {
    super_admin: exports.ONESIGNAL_ROLE_TAGS.SUPER_ADMIN,
    admin_product: exports.ONESIGNAL_ROLE_TAGS.ADMIN_PRODUCT,
    admin_order: exports.ONESIGNAL_ROLE_TAGS.ADMIN_ORDER,
    admin_user: exports.ONESIGNAL_ROLE_TAGS.ADMIN_USER,
    admin_balance: exports.ONESIGNAL_ROLE_TAGS.ADMIN_BALANCE,
    admin_chief_accountant: exports.ONESIGNAL_ROLE_TAGS.CHIEF_ACCOUNTANT,
    admin_accountant: exports.ONESIGNAL_ROLE_TAGS.ACCOUNTANT,
}
