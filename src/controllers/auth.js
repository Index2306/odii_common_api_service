/* eslint-disable camelcase */
const debug = require('debug')('odii-api:controllers:auth')
const Joi = require('joi')
const { _, isEmpty } = require('lodash')
const User = require('../models/user')
const Tenant = require('../models/tenant')
const Role = require('../models/role')
const Partner = require('../models/partner')
const Supplier = require('../models/supplier')
const Store = require('../models/store')
const EmailService = require('../services/email')
const UserService = require('../services/user')
const AuthSocialService = require('../services/auth-social')
const { knex } = require('../connections/pg-general')
const { createUser, createUserBase } = require('../services/user')
const { pushMessage } = require('../services/onesignal.service')
const ProductSourceRepo = require('../models/product-source')
const {
    lzdMoatLogin,
    lzdMoatComputeRisk,
} = require('../services/lazada.service')
const {
    verifyTokenDetail,
    comparePassword,
    hashPassword,
    verifyForgotPasswordToken,
    getUserTokenFull,
    verifyIntiveUserToPartnerToken,
    verifyRefreshToken,
    validPassword,
    passwordGenerator,
} = require('../utils/auth.util')
const {
    STATUS,
    ACC_TYPE_ARR,
    ACC_TYPE,
    // SALE_CHANNEL,
    SUP_STATUS,
} = require('../constants')
const { getRandomAvatar } = require('../constants/data')
const { ADMIN_URL } = require('../config')
const { default: logger } = require('../logger')

exports.signup = async (request) => {
    debug('POST /signup')
    const domain = request.headers.origin

    const { recaptcha_token, ati, ...value } = await Joi.object()
        .keys({
            email: Joi.string().email().required(),
            password: validPassword(),
            full_name: Joi.string(),
            first_name: Joi.string(),
            last_name: Joi.string(),
            phone: Joi.string(),
            source: Joi.valid(...ACC_TYPE_ARR),
            recaptcha_token: Joi.string(),
            ati: Joi.string(),
            partner_affiliate_code: Joi.string().optional(),
        })
        .and('email', 'password')
        .validateAsync({ ...request.body, source: request.odii_source })

    const tenant = await Tenant.getTenantByDomain(domain, value.source)
    if (!tenant) throw new Error('company_does_not_exist')

    const dataCheck = await User.getAllUsers({
        account_type: value.source,
        is_deleted: false,
        status: 'active',
        tenant_id: tenant.id,
    })

    const subscript = await Tenant.getSubscription({
        tenant_id: tenant.id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    if (dataCheck.length >= subscript.rule.maxSeller && request.odii_source === ACC_TYPE.SELLER) {
        const options = {
            message: `Có seller đăng kí hệ thống nhưng số tài khoản seller hoạt động đã đạt mức tối đa cho phép của gói ${subscript.name}, Vui lòng nấng cấp gói hoặc mua thêm seller`,
            segment: 'Admin',
            url: `${ADMIN_URL}/subscription`,
        }
        pushMessage(options)
        throw new Error('seller_has_reached_maximum')
    }

    if (dataCheck.length >= subscript.rule.maxSupplier && request.odii_source === ACC_TYPE.SUP) {
        const options = {
            message: `Có supplier đăng kí hệ thống nhưng số tài khoản supplier hoạt động đã đạt mức tối đa cho phép của gói ${subscript.name}, Vui lòng nấng cấp gói hoặc mua thêm supplier`,
            segment: 'Admin',
            url: `${ADMIN_URL}/subscription`,
        }
        pushMessage(options)
        throw new Error('supplier_has_reached_maximum')
    }

    const options = {
        ...value,
        tenant_id: tenant.id
    }

    if (recaptcha_token) {
        await AuthSocialService.verifyRecaptchaV3(recaptcha_token, request.ip)
    }
    const data = await createUser(options, true)

    if (request.odii_source === ACC_TYPE.SELLER) {
        const options = {
            message: 'Có seller đăng kí hệ thống rồi này',
            segment: 'Admin',
            url: `${ADMIN_URL}/users`,
        }
        pushMessage(options)
    } else if (request.odii_source === ACC_TYPE.SUP) {
        const options = {
            message: 'Có supplier đăng kí hệ thống rồi này',
            segment: 'Admin',
            url: `${ADMIN_URL}/users`,
        }
        pushMessage(options)
    }

    return {
        is_success: true,
        ...data,
    }
}

exports.activeUser = async (request) => {
    debug('POST /activeUser')
    const { active_token } = await Joi.object()
        .keys({
            active_token: Joi.string().required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const verifyData = verifyTokenDetail(active_token)
    if (!verifyData?.is_success) throw new Error(verifyData?.error_code)
    const user = await User.getUserById(verifyData?.data?.id)
    if (user.status === STATUS.ACTIVE) throw new Error('user_activated')
    // if (user.status === STATUS.ACTIVE) {
    //     return {
    //         message: 'user_activated',
    //         is_success: true,
    //         data: getUserTokenFull(user.id, request.odii_source),
    //     }
    // }
    if (user.register_status !== 'pending') throw new Error('invalid_user')
    const updateBody = {
        status: STATUS.ACTIVE,
        register_status: STATUS.ACTIVE,
    }
    if (request.odii_source === ACC_TYPE.SUP) {
        updateBody.supplier_status = STATUS.INACTIVE
    }
    await User.updateUserById(verifyData?.data?.id, updateBody)

    return {
        message: 'active success',
        is_success: true,
        data: getUserTokenFull(user.id, request.odii_source, verifyData?.tenant_id),
    }
}

exports.resendEmailActiveUser = async (request) => {
    debug('POST /resendEmailActiveUser')
    const { email, source, recaptcha_token } = await Joi.object()
        .keys({
            email: Joi.string().email().required(),
            source: Joi.valid(...ACC_TYPE_ARR).required(),
            recaptcha_token: Joi.string(),
        })
        .validateAsync(
            {
                ...request.query,
                ...request.body,
                source: request.odii_source,
            },
            { stripUnknown: true }
        )
    if (recaptcha_token) {
        await AuthSocialService.verifyRecaptchaV3(recaptcha_token, request.ip)
    }
    const user = await User.getUser({ email, account_type: source })
    if (!user) throw new Error('EMAIL_NOT_FOUND')
    if (user.status === STATUS.ACTIVE) throw new Error('user_activated')
    await EmailService.requireActiveUser({
        email: user.email,
        user_id: user.id,
        source,
        tenant_id: user.tenant_id,
    })

    return { message: 'email_sent', is_success: true }
}

exports.signin = async (request) => {
    debug('POST /signin')
    const domain = request.headers.origin

    const { source, recaptcha_token, ati, social_type, ...value } =
        await Joi.object()
            .keys({
                source: Joi.valid(...ACC_TYPE_ARR).required(),
                email: Joi.string().email(),
                password: Joi.string(),
                token: Joi.string(),
                recaptcha_token: Joi.string(),
                social_type: Joi.string().valid('facebook', 'google'),
                ati: Joi.string(),
                partner_affiliate_code: Joi.string().optional(),
            })
            .and('email', 'password')
            .and('token', 'social_type')
            .xor('email', 'token')
            .validateAsync(
                { ...request.body, source: request.odii_source },
                { stripUnknown: true }
            )
    const tenant = await Tenant.getTenantByDomain(domain, source)
    if (!tenant) {
        throw new Error('company_does_not_exist')
    } else {
        if (tenant?.status === 'inactive') {
            throw new Error('tenant_inactive')
        }
    }

    const subscript = await Tenant.getSubscription({
        tenant_id: tenant.id,
        status: 'active'
    })

    if (!subscript && source !== ACC_TYPE.ADMIN) {
        throw new Error('subscription_has_expired')
    }

    if (recaptcha_token) {
        await AuthSocialService.verifyRecaptchaV3(recaptcha_token, request.ip)
    }

    // eslint-disable-next-line prefer-destructuring
    let email = value.email
    let socialUser
    let isSocialLogin = false

    if (value.token && social_type) {
        if (social_type === 'facebook') {
            socialUser = await AuthSocialService.getFacebookUserInfo(
                value.token
            )
        }
        if (social_type === 'google') {
            socialUser = await AuthSocialService.getGoogleUserInfoV2(
                value.token
            )
        }
        if (!socialUser) {
            throw new Error('SOCIAL_USER_INFO_NOT_FOUND')
        }
        if (socialUser.error)
            throw new Error(
                socialUser.error?.message || 'get_social_info_error'
            )
        email = socialUser.email
        if (!email) throw new Error('SOCIAL_EMAIL_NOT_FOUND')
        isSocialLogin = true
    }
    // let user = await User.getUserByEmail(email)
    // get info user in database
    let user = await User.getUser({
        email,
        account_type: source,
        is_deleted: false,
        tenant_id: tenant.id,
    })

    if (socialUser) {
        // TODO: Tạo tài khoản
        if (!user) {
            user = await createUserBase({
                email,
                full_name: socialUser.name,
                status: STATUS.ACTIVE,
                register_status: STATUS.ACTIVE,
                avatar: { origin: socialUser.avatar },
                account_type: source,
                ...(source === ACC_TYPE.SUP && {
                    supplier_status: SUP_STATUS.PENDING_FOR_REVIEW,
                }),
                ...(social_type === 'facebook' && {
                    facebook_metadata: socialUser,
                }),
                ...(social_type === 'google' && {
                    google_metadata: socialUser,
                }),
                partner_affiliate_code: value.partner_affiliate_code,
                tenant_id: tenant.id,
            })
        } else {
            const userUpdateData = {
                ...(social_type === 'facebook' && {
                    facebook_metadata: socialUser,
                }),
                ...(social_type === 'google' && {
                    google_metadata: socialUser,
                }),
            }
            if (!user.avatar)
                userUpdateData.avatar = { origin: socialUser.avatar }

            await User.updateUserById(user.id, userUpdateData)
        }

        isSocialLogin = true
    } else {
        if (!user) throw new Error('user_does_not_exist')

        const userAuth = await User.getUserAuth(user.id)
        const valid = await comparePassword(
            value.password,
            userAuth.password_hash
        )
        if (!valid) {
            await lzdMoatLogin({
                userId: user.id,
                tid: user.email,
                userIp: request.ip,
                ati,
                loginResult: 'fail',
                loginMessage: 'wrong account or password',
            })
            throw new Error('wrong_account_or_password')
        }
    }
    if (source === ACC_TYPE.SELLER || source === ACC_TYPE.SUP) {
        const userDetail = await User.getUserDetail(user.id, {
            is_admin_listing: 'true',
        })
        if (!userDetail?.partner_user_is_active) {
            throw new Error('user_status_inactive')
        }
    }

    // if (user.supplier_status === SUP_STATUS.PENDING_FOR_REVIEW) {
    //     throw new Error('supplier_pending_for_review')
    // }
    if (source === ACC_TYPE.SUP) {
        const userDetail = await User.getUserDetail(user.id, {
            is_admin_listing: 'true',
        })

        const supplier = await Supplier.getSupplier({
            partner_id: userDetail.partner_id,
        })
        console.log(11111)
        if (supplier?.status === STATUS.INACTIVE)
            throw new Error('supplier_status_inactive')
    }

    if (isSocialLogin) {
        return {
            is_success: true,
            data: getUserTokenFull(user.id, source, tenant.id),
        }
    }
    if (user?.status !== STATUS.ACTIVE) {
        await lzdMoatLogin({
            userId: user.id,
            tid: user.email,
            userIp: request.ip,
            ati,
            loginResult: 'fail',
            loginMessage: 'user inactive',
        })
        if (user.register_status === 'pending')
            throw new Error('pending_for_active')
        throw new Error('user_inactive')
    }

    await lzdMoatLogin({
        userId: user.id,
        tid: user.email,
        userIp: request.ip,
        ati,
        loginResult: 'success',
        loginMessage: 'success',
    })

    await lzdMoatComputeRisk({
        userId: user.id,
        userIp: request.ip,
        ati,
    })
    return {
        is_success: true,
        data: getUserTokenFull(user.id, source, tenant.id),
    }
}

exports.refreshNewAccessToken = async (request, reply) => {
    debug('POST /refresh')
    const domain = request.headers.origin

    const { refresh_token } = await Joi.object()
        .keys({
            refresh_token: Joi.string().required(),
        })
        .validateAsync(request.query, { stripUnknown: true })

    const tenant = await Tenant.getTenantByDomain(domain, request.odii_source)
    if (!tenant) throw new Error('company_does_not_exist')

    const payload = verifyRefreshToken(refresh_token)
    if (!payload?.id) {
        reply.code(401).send({
            error_code: 'invalid_refresh_token',
            error_message: 'invalid refresh token',
        })
    }

    return {
        is_success: true,
        data: getUserTokenFull(payload.id, request.odii_source, tenant.id),
    }
}

exports.forgot = async (request) => {
    debug('POST /forgot')
    const domain = request.headers.origin

    const { email, recaptcha_token } = await Joi.object()
        .keys({
            email: Joi.string().email().required(),
            recaptcha_token: Joi.string(),
        })
        .validateAsync(
            {
                ...request.query,
                ...request.body,
            },
            { stripUnknown: true }
        )

    const tenant = await Tenant.getTenantByDomain(domain, request.odii_source)
    if (!tenant) throw new Error('company_does_not_exist')

    if (recaptcha_token) {
        await AuthSocialService.verifyRecaptchaV3(recaptcha_token, request.ip)
    }
    // const user = await User.getUserByEmail(email)
    const user = await User.getUser({
        email,
        account_type: request.odii_source,
        tenant_id: tenant.id,
    })

    if (!user) throw new Error('EMAIL_NOT_FOUND')
    if (user.status !== STATUS.ACTIVE) throw new Error('USER_INACTIVE')
    await EmailService.resetUserPassword({ email, source: request.odii_source, tenant_id: user.tenant_id })

    return {
        is_success: true,
        message: 'success',
        data: { email, source: request.odii_source },
    }
}

exports.resetPasswordCtl = async (request) => {
    debug('POST /resetPasswordCtl')

    const { active_token, password, recaptcha_token } = await Joi.object()
        .keys({
            active_token: Joi.string().required(),
            password: validPassword(),
            recaptcha_token: Joi.string(),
        })
        .validateAsync(
            { ...request.query, ...request.body },
            { stripUnknown: true }
        )
    if (recaptcha_token) {
        await AuthSocialService.verifyRecaptchaV3(recaptcha_token, request.ip)
    }
    const verifyData = verifyForgotPasswordToken(active_token)
    if (!verifyData) throw new Error('TOKEN_INVALID')
    console.log('verifyData', verifyData)
    const user = await User.getUserWithAuthByEmail(
        verifyData?.email,
        verifyData?.source
    )
    if (user.status === STATUS.INACTIVE) throw new Error('USER_INACTIVE')

    const nearest_password = await User.getPasswordHistory({
        user_id: user.id,
    })

    // eslint-disable-next-line no-restricted-syntax
    for await (const item of nearest_password) {
        if (await comparePassword(password, item.password_hash))
            throw new Error(
                'new password must be different from last 4 passwords'
            )
    }

    const newHashPassword = await hashPassword(password)

    await User.insertPasswordHistory({
        user_id: user.id,
        password_hash: newHashPassword,
    })

    await User.updateUserAuth(user.id, {
        password_hash: newHashPassword,
    })
    await User.updateUserById(user.id, {
        password_created_at: new Date().toISOString(),
    })

    return { is_success: true, message: 'success' }
}

exports.changePassword = async (request) => {
    debug('POST /changePassword')

    const { old_password, password } = await Joi.object()
        .keys({
            old_password: Joi.string().min(8).required(),
            password: validPassword(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const userReg = request.user

    const user = await User.getUserById(userReg.id)
    if (user.status !== STATUS.ACTIVE) throw new Error('USER_INACTIVE')
    const userAuth = await User.getUserAuth(userReg.id)

    const valid = await comparePassword(old_password, userAuth.password_hash)

    if (!valid) throw new Error('INVALID_PASSWORD')

    const nearest_password = await User.getPasswordHistory({
        user_id: userAuth.user_id,
    })

    // eslint-disable-next-line no-restricted-syntax
    for await (const item of nearest_password) {
        if (await comparePassword(password, item.password_hash))
            throw new Error(
                'new password must be different from last 4 passwords'
            )
    }

    const newHashPassword = await hashPassword(password)

    await User.insertPasswordHistory({
        user_id: userAuth.user_id,
        password_hash: newHashPassword,
    })
    await User.updateUserAuth(userReg.id, {
        password_hash: newHashPassword,
    })
    await User.updateUserById(userReg.id, {
        password_created_at: new Date().toISOString(),
    })

    return { is_success: true, message: 'success' }
}

exports.sellerInviteUserToPartner = async (request) => {
    debug('POST /seller invite UserToPartner')
    const { user } = request

    const { email, full_name, phone, role_ids, store_ids, source, source_ids } =
        await Joi.object()
            .keys({
                email: Joi.string().email().required(),
                full_name: Joi.string(),
                phone: Joi.string(),
                source: Joi.string(),
                role_ids: Joi.array().items(Joi.string()).required(),
                store_ids: Joi.array().items(Joi.string()).required(),
            })
            .validateAsync(
                {
                    ...request.query,
                    ...request.body,
                    source: request.odii_source,
                },
                { stripUnknown: true }
            )

    const roles = await Role.getRolesByIds(role_ids)
    const isRole = roles.find((item) => item.title === 'partner_source')
    if (!isEmpty(isRole)) {
        throw new Error('Không thể thực hiện, vui lòng liên hệ hỗ trợ')
    }

    const stores = await Store.getStoresByIds(store_ids)
    const existedSeller = await User.getUser({
        email,
        account_type: ACC_TYPE.SELLER,
        is_deleted: false,
        tenant_id: user.tenant_id,
    })
    if (existedSeller) {
        throw new Error('Tài khoản đã tồn tại')
    }
    if (existedSeller) {
        const getUserPartnerRoles = await User.getUserPartnerRoles(
            existedSeller.id
        )
        if (user.partner_id === getUserPartnerRoles.partner_id) {
            throw new Error('partner_existed')
        }
    }

    const dataCheck = await User.getAllUsers({
        account_type: ACC_TYPE.SELLER,
        is_deleted: false,
        status: 'active',
        tenant_id: user.tenant_id,
    })

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    if (dataCheck.length >= subscript.rule.maxSeller) {
        throw new Error('Số tài khoản seller hoạt động đã đạt mức tối đa cho phép của gói, vui lòng liên hệ admin để được hỗ trợ')
    }

    // if (!inviteUser) {
    //     console.log('SEND EMAIL INVITE')
    //     await EmailService.inviteUserToPartner({
    //         email,
    //         full_name,
    //         phone,
    //         user,
    //         role_ids,
    //         store_ids,
    //         source,
    //     })

    //     return {
    //         is_success: true,
    //         data: { email, full_name, phone, roles, stores },
    //     }
    // }

    // send email invite
    console.log('SEND EMAIL INVITE')
    await EmailService.inviteUserToPartner({
        email,
        full_name,
        phone,
        user,
        source,
        store_ids,
        role_ids,
        source_ids,
    })

    return {
        is_success: true,
        data: { email, full_name, phone, roles, stores },
    }
}
exports.supplierInviteUserToPartner = async (request) => {
    debug('POST /supplier inviteUserToPartner')
    const { user } = request

    const { email, full_name, phone, role_ids, store_ids, source, source_ids } =
        await Joi.object()
            .keys({
                email: Joi.string().email().required(),
                full_name: Joi.string(),
                phone: Joi.string(),
                source: Joi.string(),
                role_ids: Joi.array().items(Joi.string()).required(),
                source_ids: Joi.array().items(Joi.number()).required(),
            })
            .validateAsync(
                {
                    ...request.query,
                    ...request.body,
                    source: request.odii_source,
                },
                { stripUnknown: true }
            )

    const roles = await Role.getRolesByIds(role_ids)

    const titleRole = roles.find((item) => item.title === 'partner_source')

    if (!isEmpty(source_ids) && isEmpty(titleRole)) {
        throw new Error('Vui lòng chọn nhà cung cấp hàng.')
    }

    if (isEmpty(source_ids) && !isEmpty(titleRole)) {
        throw new Error('Vui lòng chọn nguồn hàng cung cấp.')
    }

    const sources = await ProductSourceRepo.getProductSourceByIds(source_ids)

    // const inviteUser = await User.getUserByEmail(email)
    const inviteUser = await User.getUser({
        email,
        account_type: source,
        // is_supplier: true,
        is_deleted: false,
        tenant_id: user.tenant_id,
    })

    if (inviteUser?.id) {
        const invitePartnerUser = await User.getPartnerUsers({
            user_id: inviteUser?.id,
        })
        const isPartnerUser = invitePartnerUser.find(
            (item) => item.partner_id === user.partner_id
        )

        if (isPartnerUser) {
            throw new Error('Tài khoản đã tồn tại')
        }
    }

    if (inviteUser && isEmpty(titleRole)) {
        throw new Error('Tài khoản đã tồn tại')
    }

    const dataCheck = await User.getAllUsers({
        account_type: source,
        is_deleted: false,
        status: 'active',
        tenant_id: user.tenant_id,
    })

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: 'active'
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    if (dataCheck.length >= subscript.rule.maxSupplier) {
        throw new Error('Số tài khoản supplier hoạt động đã đạt mức tối đa cho phép của gói, Xin liên hệ với Odii để nâng hạn mức số Supplier')
    }

    if (!inviteUser) {
        await EmailService.inviteUserToPartner({
            email,
            full_name,
            phone,
            user,
            role_ids,
            source,
            source_ids,
        })

        return {
            is_success: true,
            data: { email, full_name, phone, roles, source, sources },
        }
    }

    const getUserPartnerRoles = await User.getUserPartnerRoles(inviteUser?.id)
    if (user.partner_id === getUserPartnerRoles.partner_id) {
        throw new Error('partner_existed')
    }

    // send email invite
    console.log('SEND EMAIL INVITE')
    await EmailService.inviteUserToPartner({
        email,
        full_name,
        phone,
        user,
        source,
        store_ids,
        role_ids,
        source_ids,
    })

    return {
        is_success: true,
        data: { email, full_name, phone, roles, sources },
    }
}

exports.verifyInvite = async (request) => {
    debug('POST /verifyInvite')
    const { active_token } = await Joi.object()
        .keys({
            active_token: Joi.string().required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const verifyData = verifyIntiveUserToPartnerToken(active_token)
    const roles = await Role.getRolesByIds(verifyData?.role_ids)
    const titleRole = roles.find((item) => item.title === 'partner_source')

    if (!verifyData) throw new Error('token_invalid')
    // eslint-disable-next-line prefer-const
    // let inviteUser = await User.getUserByEmail(verifyData?.email)
    const inviteUser = await User.getUser({
        email: verifyData?.email,
        account_type: verifyData?.source,
        is_deleted: false,
        tenant_id: verifyData?.tenant_id
    })
    if (isEmpty(titleRole)) {
        if (inviteUser) {
            logger.info(
                `[verifyInvite] user existed. Email=${verifyData?.email} AccountType=${verifyData?.source}`
            )

            return {
                is_success: false,
                error_code: 'user_already_exist',
            }
        }
    }

    if (!isEmpty(titleRole) && !isEmpty(inviteUser?.id)) {
        const [newPartnerUserId] = await User.insertPartnerUser(
            {
                partner_id: verifyData?.partner_id,
                user_id: inviteUser?.id,
                is_active: true,
                is_owner: false,
            },
            {}
        )
        if (!newPartnerUserId) {
            throw new Error('Vui lòng chọn nguồn hàng cung cấp.')
        }

        await User.insertPartnerUserRole(
            verifyData?.role_ids?.map((role_id) => ({
                role_id,
                partner_user_id: newPartnerUserId,
            })),
            {}
        )

        if (!_.isEmpty(verifyData?.source_ids)) {
            verifyData?.source_ids.map(async (id) => {
                await ProductSourceRepo.updateProductSourceById(id, {
                    user_id: inviteUser?.id,
                })
            })
        }

        return {
            message: 'active success but you need update profile',
            is_success: true,
        }
    }

    // if (!inviteUser) {
    const userIdOut = await knex.transaction(async (trx) => {
        const userBody = {
            email: verifyData?.email,
            full_name: verifyData?.full_name,
            phone: verifyData?.phone,
            status: STATUS.ACTIVE,
            register_status: STATUS.ACTIVE,
            avatar: JSON.stringify(getRandomAvatar()),
            is_seller: verifyData?.source === ACC_TYPE.SELLER,
            account_type: verifyData?.source,
            is_supplier: verifyData?.source === ACC_TYPE.SUP,
            tenant_id: verifyData?.tenant_id,
        }

        if (verifyData?.source === ACC_TYPE.SUP) {
            userBody.supplier_status = STATUS.ACTIVE
        }

        const [userId] = await User.insertUser(userBody, { trx })

        const randomPassword = passwordGenerator()
        console.log(
            '>>>>>>>>>>>>>>>>>>>>>>>>>>> randomPassword = ',
            randomPassword
        )
        await User.insertUserAuth(
            {
                user_id: userId,
                password_hash: await hashPassword(randomPassword),
            },
            { trx }
        )

        const [partnerId] = await Partner.insertPartner(
            {
                user_id: userId,
                name: verifyData?.full_name || verifyData?.email,
            },
            { trx }
        )

        const [ownerPartnerUserId] = await User.insertPartnerUser(
            {
                partner_id: partnerId,
                user_id: userId,
                is_active: false,
                is_owner: true,
            },
            { trx }
        )

        // set current partner active
        const [newPartnerUserId] = await User.insertPartnerUser(
            {
                partner_id: verifyData?.partner_id,
                user_id: userId,
                is_active: true,
                is_owner: false,
            },
            { trx }
        )

        await User.insertPartnerUserRole({
            role_id: 1, // default role : owner
            partner_user_id: ownerPartnerUserId,
        })

        await User.insertPartnerUserRole(
            verifyData?.role_ids?.map((role_id) => ({
                role_id,
                partner_user_id: newPartnerUserId,
            })),
            { trx }
        )

        if (!_.isEmpty(verifyData?.store_ids)) {
            await User.insertPartnerUserStore(
                verifyData?.store_ids.map((store_id) => ({
                    store_id,
                    partner_user_id: newPartnerUserId,
                }))
            )
        }

        if (!_.isEmpty(verifyData?.source_ids)) {
            verifyData?.source_ids.map(async (id) => {
                await ProductSourceRepo.updateProductSourceById(
                    id,
                    {
                        user_id: userId,
                    },
                    { trx }
                )
            })
        }

        // await Store.insertStore({
        //     partner_id: partnerId,
        //     name: 'Personal Store',
        //     platform: SALE_CHANNEL.PERSONAL,
        // })

        await EmailService.welcomePlatformWithAccountInfo({
            email: verifyData?.email,
            password: randomPassword,
            source: request.odii_source,
            tenant_id: verifyData?.tenant_id,
        })
    })

    return {
        message: 'active success but you need update profile',
        is_success: true,
        data: {
            next_step: 'update_profile',
            ...getUserTokenFull(userIdOut, request.odii_source, verifyData?.tenant_id),
        },
    }
    // }

    // const resultTrx = await knex.transaction(async (trx) => {
    //     if (verifyData?.source === ACC_TYPE.SUP) {
    //         const updateUserData = {
    //             // is_supplier: true,
    //             supplier_status: STATUS.ACTIVE,
    //             account_type: verifyData?.source,
    //             is_seller: verifyData?.source === ACC_TYPE.SELLER,
    //             is_supplier: verifyData?.source === ACC_TYPE.SUP,
    //         }
    //         if (verifyData?.source !== ACC_TYPE.SUP)
    //             delete updateUserData.supplier_status
    //         await User.updateUserById(inviteUser?.id, updateUserData)
    //     }

    //     await User.updatePartnerUser(
    //         { user_id: inviteUser?.id },
    //         { is_active: false },
    //         { trx }
    //     )
    //     const [newPartnerUserId] = await User.upsertPartnerUserActive(
    //         {
    //             partner_id: verifyData?.partner_id,
    //             user_id: inviteUser?.id,
    //         },
    //         { trx }
    //     )

    //     await User.insertPartnerUserRole(
    //         verifyData?.role_ids?.map((role_id) => ({
    //             role_id,
    //             partner_user_id: newPartnerUserId,
    //         })),
    //         { trx }
    //     )

    //     if (!_.isEmpty(verifyData?.store_ids)) {
    //         await User.insertPartnerUserStore(
    //             verifyData?.store_ids.map((store_id) => ({
    //                 store_id,
    //                 partner_user_id: newPartnerUserId,
    //             })),
    //             { trx }
    //         )
    //     }

    //     return true
    // })

    // return {
    //     message: 'active success',
    //     is_success: resultTrx,
    //     data: getUserTokenFull(inviteUser?.id, request.odii_source),
    // }
}

exports.supplierRemoveStaff = async (request) => {
    const { user } = request

    const { user_ids } = await Joi.object()
        .keys({
            user_ids: Joi.array().items(Joi.string()).required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    if (!user.is_partner_owner) throw new Error('you do not have a owner')

    if (user_ids.includes(user.id))
        throw new Error('you_can_not_remove_yourself')

    const option = {}

    option.partner_id = user.partner_id

    UserService.deleteManyStaffs(user_ids, option)

    return {
        is_success: true,
    }
}

exports.sellerRemoveStaff = async (request) => {
    const { user } = request
    const { user_ids } = await Joi.object()
        .keys({
            user_ids: Joi.array().items(Joi.string()).required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    if (!user.is_partner_owner) throw new Error('you do not have a owner')

    if (user_ids.includes(user.id))
        throw new Error('you_can_not_remove_yourself')

    const option = {}

    option.partner_id = user.partner_id

    UserService.deleteManyStaffs(user_ids, option)

    return {
        is_success: true,
    }
}
