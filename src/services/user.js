// const Joi = require('joi')
const BlueBird = require('bluebird')
const moment_tz = require('moment-timezone')
const { isEmpty } = require('lodash')
const User = require('../models/user')
const Partner = require('../models/partner')
const Balance = require('../models/balance')
const DebtPeriod = require('../models/debt-period')
const Template = require('../models/template')
// const Store = require('../models/store')
const EmailService = require('./email')
// const AuthSocialService = require('./auth-social')
const { passwordGenerator } = require('../utils/auth.util')
const { knex, useMyTrx } = require('../connections/pg-general')
const { hashPassword } = require('../utils/auth.util')
const {
    STATUS,
    BALANCE_TYPE,
    ROLES_ID_OF_ADMIN,
    ACC_TYPE,
    ROLE_OWNER_ID,
    TIME_ZONE,
    CURRENCY_CODE: { VND },
} = require('../constants')
const { getRandomAvatar } = require('../constants/data')
const { insertPartnerAffiliate } = require('./partner-affiliate.service')

exports.createUser = async (body, isRequireActive = false) => {
    const { password, source, partner_affiliate_code, ...value } = body
    const user = await User.getUser({
        email: value.email,
        account_type: source,
        is_deleted: false,
        tenant_id: value.tenant_id,
    })
    if (user) {
        if (user.register_status === 'pending')
            throw new Error('pending_for_active')

        if (user.status !== STATUS.ACTIVE) throw new Error('USER_INACTIVE')

        throw new Error('user_already_exist')
    }

    if (!value.full_name && (value.first_name || value.last_name)) {
        value.full_name = [value.first_name, value.last_name].join(' ').trim()
    }

    // if (source === ACC_TYPE.SUP)
    //     value.supplier_status = SUP_STATUS.PENDING_FOR_REVIEW
    if (isRequireActive) {
        value.register_status = 'pending'
    } else {
        value.register_status = STATUS.ACTIVE
    }
    // value.is_seller = true
    value.is_supplier = source === ACC_TYPE.SUP
    value.is_seller = source === ACC_TYPE.SELLER
    value.is_admin = source === ACC_TYPE.ADMIN
    value.account_type = source
    if (!value.avatar) value.avatar = JSON.stringify(getRandomAvatar())
    const user_id = await useMyTrx(null, async (trx) => {
        const [userId] = await User.insertUser(value, { trx })
        const hash = await hashPassword(password)
        await User.insertUserAuth(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        await User.insertPasswordHistory(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        const [partnerId] = await Partner.insertPartner(
            {
                user_id: userId,
                name:
                    value.fullname ||
                    [value.first_name, value.last_name].join(' ').trim(),
            },
            { trx }
        )
        // set current partner active
        const [partnerUserId] = await User.insertPartnerUser(
            {
                partner_id: partnerId,
                user_id: userId,
                is_active: true,
                is_owner: true,
            },
            { trx }
        )

        // TODO: add default role (title = owner = 1)
        await User.upsertPartnerUserRole(
            {
                role_id: ROLE_OWNER_ID,
                partner_user_id: partnerUserId,
            },
            { trx }
        )

        // insert balance
        await Balance.insertBalance(
            {
                partner_id: partnerId,
                amount: 0,
                currency: VND,
                type: BALANCE_TYPE.PRIMARY,
            },
            { trx }
        )

        // await Store.insertStore({
        //     partner_id: partnerId,
        //     name: 'Personal Store',
        //     platform: SALE_CHANNEL.PERSONAL,
        // })

        await insertPartnerAffiliate(
            {
                account_type: source,
                partner_id: partnerId,
                partner_affiliate_code,
            },
            { trx }
        )

        if (isRequireActive) {
            await EmailService.requireActiveUser({
                email: value.email,
                user_id: userId,
                source,
                tenant_id: value.tenant_id,
            })
        } else {
            await User.updateUserById(
                userId,
                { status: 'active', account_type: source },
                { trx }
            )
        }

        return userId
    })

    return { user_id }
}

exports.createUserBase = async (userData) => {
    console.log('run createUserBase')
    const { partner_affiliate_code } = userData
    delete userData.partner_affiliate_code

    if (!userData.avatar) userData.avatar = JSON.stringify(getRandomAvatar())
    const userDataOut = await useMyTrx(null, async (trx) => {
        const [userId] = await User.insertUser(
            {
                ...userData,
                is_seller: true,
            },
            { trx }
        )
        const randomPassword = Math.random().toString(36).slice(-8)
        const password_hash = await hashPassword(randomPassword)
        await User.insertUserAuth(
            {
                user_id: userId,
                password_hash,
            },
            { trx }
        )
        await User.insertPasswordHistory(
            {
                user_id: userId,
                password_hash,
            },
            { trx }
        )

        const [partnerId] = await Partner.insertPartner(
            {
                user_id: userId,
            },
            { trx }
        )
        const [partnerUserId] = await User.insertPartnerUser(
            {
                partner_id: partnerId,
                user_id: userId,
                is_active: true,
                is_owner: true,
            },
            { trx }
        )
        // TODO: add default role (title = owner = 1)
        await User.upsertPartnerUserRole(
            {
                role_id: ROLE_OWNER_ID,
                partner_user_id: partnerUserId,
            },
            { trx }
        )

        console.log('partnerId = ', partnerId)
        console.log('userId = ', userId)
        // insert balance
        await Balance.insertBalance(
            {
                partner_id: partnerId,
                amount: 0,
                currency: VND,
                type: BALANCE_TYPE.PRIMARY,
            },
            { trx }
        )

        await insertPartnerAffiliate(
            {
                account_type: userData.account_type,
                partner_id: partnerId,
                partner_affiliate_code,
            },
            { trx }
        )

        // await Store.insertStore({
        //     partner_id: partnerId,
        //     name: 'Personal Store',
        //     platform: SALE_CHANNEL.PERSONAL,
        // })

        await EmailService.welcomePlatformWithAccountInfo({
            email: userData.email,
            password: randomPassword,
            source: userData.account_type,
            tenant_id: userData.tenant_id,
        })

        return {
            id: userId,
            ...userData,
            partnerId,
            partnerUserId,
            is_seller: true,
        }
    })

    return userDataOut
}

// eslint-disable-next-line import/prefer-default-export
exports.deleteUserInactive = async () => {
    console.log('run check user inactive')

    const moment10DaysAgo = moment_tz()
        .tz(TIME_ZONE.VN_TZ)
        .subtract(43200, 'minute') // 30d = 43200 mins

    const users = await User.getUserByStatus({
        register_status: 'pending',
        created_at: moment10DaysAgo.toISOString(),
    })
    await BlueBird.map(
        users,
        async (user) => {
            console.log('RUN at user id = ', user.id)
            try {
                console.log(user.id)
                await User.deleteUserNotActive(user.id).catch((err) => {
                    console.error('await User delete')
                    console.error(err)
                })
            } catch (err) {
                console.error('user id = ', user.id)
                console.error(err)
            }
        },
        { concurrency: 5 }
    )
    console.log('DONE run checkUserInactive')
}

// eslint-disable-next-line import/prefer-default-export
exports.notifyChangePassword = async () => {
    console.log('run notify change password')

    const moment90DaysAgo = moment_tz()
        .tz(TIME_ZONE.VN_TZ)
        .subtract(129600, 'minute') // 90d = 129600 mins

    const users = await User.getAllUserAuth({
        created_at: moment90DaysAgo.toISOString(),
    })
    await BlueBird.map(
        users,
        async (item) => {
            try {
                console.error('user must change password', item.user_id)
            } catch (err) {
                console.error('user id = ', item.user_id)
                console.error(err)
            }
        },
        { concurrency: 5 }
    )
    console.log('done')
}

exports.deleteManyStaffs = async (user_ids, option) => {
    const usersLength = user_ids.length

    for (let i = 0; i < usersLength; i += 100) {
        // eslint-disable-next-line no-loop-func
        const requests = user_ids.slice(i, i + 10).map((user_id) =>
            knex.transaction(async (trx) => {
                const [idPartnerUser] = await User.deletePartnerUser(
                    { user_id, partner_id: option.partner_id },
                    { trx }
                )
                await User.deletePartnerUserRole(idPartnerUser, { trx })

                // update is_active = true
                await User.updatePartnerUser(
                    { user_id, is_owner: true },
                    { is_active: true }
                )
            })
        )
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(requests).catch((e) =>
            console.log(`Error in remove user  ${i} - ${e}`)
        )
    }
}

exports.adminCreateUser = async (body, options = {}, source) => {
    const { role_ids, source_ids, ...value } = body
    const user = await User.getUser({
        email: value.email,
        account_type: ACC_TYPE.ADMIN,
        tenant_id: value.tenant_id,
    })
    console.log(value)
    if (user) {
        if (user.register_status === 'pending')
            throw new Error('Tài khoản đã tồn tại và đang chờ kích hoạt')

        if (user.status !== STATUS.ACTIVE)
            throw new Error('Tài khoản đã tồn tại và đang bị vô hiệu hóa')

        throw new Error('Tài khoản đã tồn tại')
    }

    if (!value.full_name && (value.first_name || value.last_name)) {
        value.full_name = [value.first_name, value.last_name].join(' ').trim()
    }

    value.status = STATUS.ACTIVE
    value.register_status = STATUS.ACTIVE
    value.account_type = ACC_TYPE.ADMIN
    value.is_admin = true
    if (!value.avatar) value.avatar = JSON.stringify(getRandomAvatar())
    const user_id = await knex.transaction(async (trx) => {
        const [userId] = await User.insertUser(value, { trx })

        const password = passwordGenerator()
        const hash = await hashPassword(password)
        await User.insertUserAuth(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        await User.insertPasswordHistory(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        // set current partner admin
        const [partnerUserId] = await User.insertPartnerUser(
            {
                partner_id: options.partner_id,
                user_id: userId,
                is_active: true,
                is_owner: false,
            },
            { trx }
        )

        await User.insertPartnerUserRole(
            role_ids.map((role_id) => ({
                role_id,
                partner_user_id: partnerUserId,
            })),
            { trx }
        )

        if (!isEmpty(source_ids)) {
            await User.insertPartnerUserRole(
                source_ids.map((role_id) => ({
                    role_id,
                    partner_user_id: partnerUserId,
                })),
                { trx }
            )
        }

        await EmailService.adminInviteStaff({
            email: value.email,
            password,
            source,
            tenant_id: value.tenant_id,
        })

        return userId
    })

    return { user_id }
}

exports.createAdmin = async (body) => {
    const { source, seller_domain, supplier_domain, admin_domain, crm_tenant_id, ...value } = body

    if (!value.full_name && (value.first_name || value.last_name)) {
        value.full_name = [value.first_name, value.last_name].join(' ').trim()
    }

    value.status = STATUS.ACTIVE
    value.register_status = STATUS.ACTIVE
    value.is_supplier = source === ACC_TYPE.SUP
    value.is_seller = source === ACC_TYPE.SELLER
    value.is_admin = source === ACC_TYPE.ADMIN
    value.account_type = source
    if (!value.avatar) value.avatar = JSON.stringify(getRandomAvatar())
    const user_id = await useMyTrx(null, async (trx) => {
        const [userId] = await User.insertUser(value, { trx })
        const password = passwordGenerator()
        const hash = await hashPassword(password)
        await User.insertUserAuth(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        await User.insertPasswordHistory(
            {
                user_id: userId,
                password_hash: hash,
            },
            { trx }
        )
        const [partnerId] = await Partner.insertPartner(
            {
                user_id: userId,
                name:
                    value.fullname ||
                    [value.first_name, value.last_name].join(' ').trim(),
            },
            { trx }
        )
        // set current partner active
        const [partnerUserId] = await User.insertPartnerUser(
            {
                partner_id: partnerId,
                user_id: userId,
                is_active: true,
                is_owner: true,
            },
            { trx }
        )

        // TODO: add default role (title = owner = 1)
        await User.upsertPartnerUserRole(
            ROLES_ID_OF_ADMIN.map((roleId) => ({
                role_id: roleId,
                partner_user_id: partnerUserId,
            })),
            { trx }
        )

        // insert balance
        await Balance.insertBalance(
            {
                partner_id: partnerId,
                amount: 0,
                currency: VND,
                type: BALANCE_TYPE.PRIMARY,
            },
            { trx }
        )

        await DebtPeriod.genDebtPeriod(value.tenant_id)

        await Template.cloneTemplate(partnerId, value.tenant_id)

        await EmailService.adminInviteTenant({
            email: value.email,
            password,
            domain: admin_domain,
        })

        return userId
    })

    return { user_id }
}