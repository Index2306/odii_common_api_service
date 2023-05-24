const Joi = require('joi')
const _ = require('lodash')
const User = require('../models/user')
const Supplier = require('../models/supplier')
const Store = require('../models/store')
const Tenant = require('../models/tenant')
const SupplierWareHousing = require('../models/supplierWareHousing')
const { parseOption } = require('../utils/pagination')
const { STATUS, SALE_CHANNEL, USER_GENDER, ACC_TYPE } = require('../constants')
const { knex } = require('../connections/pg-general')
const { adminCreateUser } = require('../services/user')
const EmailService = require('../services/email')
const OnesignalService = require('../services/onesignal.service')
const AppError = require('../utils/app-error')

exports.adminGetUsers = async (request) => {
    const { user } = request
    const option = parseOption(request.query)

    option.tenant_id = user?.tenant_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            is_admin: Joi.boolean(),
            role: Joi.number(),
            account_type: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    let data
    if (query.is_admin) data = await User.getUserAdminListing(option, query)
    else data = await User.getUserListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getUserProfile = async (request) => {
    const { user } = request

    const tenant = await Tenant.getDomainByTenantId(user.tenant_id)

    const subscription = await Tenant.getSubscription({ tenant_id: user.tenant_id })

    delete user.is_supplier
    delete user.is_admin
    delete user.is_deleted
    delete user.is_seller
    delete user.facebook_metadata
    delete user.google_metadata
    delete user.last_webpush_player_id
    delete user.tenant_id

    return {
        is_success: true,
        data: {
            ...user,
            subscription: subscription,
            tenant_name: tenant?.full_name,
            min_limit_amount: tenant?.min_limit_amount
        },
    }
}

exports.updateMinLimitAmount = async (request) => {
    const { user } = request
    const { min_limit_amount } = await Joi.object()
        .keys({
            min_limit_amount: Joi.number().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    await Tenant.updateTenantById(user.tenant_id, {
        min_limit_amount: min_limit_amount
    })

    return {
        is_success: true,
    }
}

exports.getUserDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const options = { is_admin_listing: true }
    const data = await User.getUserDetail(id, options)
    if (!data) throw new Error('ID_NOT_FOUND')

    if (data?.roles[0] === null) {
        data.roles = []
    }

    return {
        is_success: true,
        data,
    }
}

exports.updateUser = async (request) => {
    const { user } = request

    const value = await Joi.object()
        .keys({
            full_name: Joi.string().optional(),
            first_name: Joi.string().optional(),
            last_name: Joi.string().optional(),
            phone: Joi.string().optional(),
            avatar: Joi.object().optional(),
            birthday: Joi.date().optional(),
            gender: Joi.string()
                .allow(...Object.values(USER_GENDER))
                .only()
                .optional(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    if (value.avatar) value.avatar = JSON.stringify(value.avatar)

    await User.updateUserById(user.id, value)
    await User.deleteCache(user.id)

    return {
        is_success: true,
    }
}

exports.updateUserSetting = async (request) => {
    const { user } = request

    const value = await Joi.object()
        .keys({
            recommend_price_selected_type: Joi.number(),
            recommend_price_ratio: Joi.number().optional(),
            recommend_price_plus: Joi.number().optional(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    await User.updateUserById(user.id, value)
    await User.deleteCache(user.id)

    return {
        is_success: true,
    }
}
exports.updateUserWebpushToken = async (request) => {
    const { user } = request

    const { player_id } = await Joi.object()
        .keys({
            player_id: Joi.string().required(),
        })
        .validateAsync(request.body)

    console.log('player_id', player_id)

    if (player_id !== user.onesignal_last_admin_player_id) {
        if (user.onesignal_last_admin_player_id)
            await OnesignalService.removelAllTagTagByPlayerId(
                user.onesignal_last_admin_player_id
            )
        await User.updateUserById(user.id, {
            onesignal_last_admin_player_id: player_id,
        })
        await User.deleteCache(user.id)
    }
    await OnesignalService.addTagByUser({ user_id: user.id, player_id })

    return {
        is_success: true,
    }
}

exports.adminUpdateUser = async (request) => {
    const { user_id, ...value } = await Joi.object()
        .keys({
            user_id: Joi.string().required(),
            full_name: Joi.string().optional(),
            first_name: Joi.string().optional(),
            last_name: Joi.string().optional(),
            gender: Joi.string()
                .allow(...Object.values(USER_GENDER))
                .only()
                .optional(),
            phone: Joi.string().optional(),
            avatar: Joi.object().optional(),
            birthday: Joi.date().optional(),
            status: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const isExistUser = await User.getUserById(user_id)

    if (!isExistUser) {
        throw new Error('ID_NOT_FOUND')
    }
    if (value.status === STATUS.ACTIVE) {
        const dataCheck = await User.getAllUsers({
            account_type: isExistUser.account_type,
            is_deleted: false,
            status: 'active',
            tenant_id: isExistUser.tenant_id,
        })

        const subscript = await Tenant.getSubscription({
            tenant_id: isExistUser.tenant_id,
            status: 'active'
        })

        if (dataCheck.length >= subscript.rule[`${isExistUser.account_type === ACC_TYPE.SELLER ? 'maxSeller' : 'maxSupplier'}`]) {
            throw new Error(`Số tài khoản ${isExistUser.account_type} hoạt động đã đạt mức tối đa cho phép của gói, Xin liên hệ với Odii để nâng hạn mức số  ${isExistUser.account_type}`)
        }
    }
    await User.updateUserById(user_id, value)
    // Clear caching
    await User.deleteCache(user_id)

    return {
        is_success: true,
    }
}

exports.adminSetUserBecomeSupplier = async (request) => {
    const { user } = request
    const { supplier_id, note, register_status, supplier_status } =
        await Joi.object()
            .keys({
                supplier_id: Joi.string().required(),
                supplier_status: Joi.string()
                    .required()
                    .allow(STATUS.ACTIVE, STATUS.INACTIVE)
                    .only(),
                register_status: Joi.string()
                    .required()
                    .allow(STATUS.ACTIVE, 'reject')
                    .only(),
                note: Joi.string().allow(''),
            })
            .validateAsync(
                { ...request.body, ...request.params },
                { stripUnknown: true }
            )

    const subscript = await Tenant.getSubscription({
        tenant_id: user.tenant_id,
        status: STATUS.ACTIVE
    })

    if (!subscript) {
        throw new Error('subscription_has_expired')
    }

    const supplier = await Supplier.getSupplierById(supplier_id)

    if (!supplier) throw new Error('ID_NOT_FOUND')

    if (supplier.from_user?.status !== STATUS.ACTIVE)
        throw new Error('USER_NOT_ACTIVED_YET')

    if (supplier.from_user?.account_type === ACC_TYPE.SUP)
        throw new Error('user_was_supplier')

    const body = { register_status, note }

    if (register_status === STATUS.ACTIVE) {
        body.publish_status = STATUS.ACTIVE
        await EmailService.welcomeSupplier({
            email: supplier.contact_email,
            source: ACC_TYPE.SUP,
            tenant_id: user.tenant_id,
        })
        await Store.insertStore({
            partner_id: supplier_id.partner_id,
            name: 'Personal Store',
            platform: SALE_CHANNEL.PERSONAL,
        })
    }
    if (register_status === 'reject') {
        await EmailService.registerSupplierError({
            email: supplier.contact_email,
            note,
            source: ACC_TYPE.SUP,
            tenant_id: user.tenant_id,
        })
    }
    const is_success = await knex.transaction(async (trx) => {
        await User.updateUserById(
            supplier.user_id,
            {
                supplier_status,
                account_type: ACC_TYPE.SUP,
            },
            { trx }
        )
        await Supplier.updateSupplierById(supplier.id, body, { trx })

        await SupplierWareHousing.updateSupplierWareHousing(
            { supplier_id: supplier_id },
            {
                status: STATUS.ACTIVE,
            },
            { trx }
        )

        return true
    })

    return {
        is_success,
    }
}

exports.adminSetInactiveSupplier = async (request) => {
    const { supplier_id, status } = await Joi.object()
        .keys({
            supplier_id: Joi.string().required(),
            status: Joi.string().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const supplier = await Supplier.getSupplierById(supplier_id)

    if (!supplier) throw new Error('ID_NOT_FOUND')

    if (supplier.from_user?.status !== STATUS.ACTIVE)
        throw new Error('USER_NOT_ACTIVED_YET')

    if (supplier.from_user?.account_type !== ACC_TYPE.SUP)
        throw new Error('user_was_not_supplier')

    const is_success = await knex.transaction(async (trx) => {
        // await User.updateUserById(
        //     supplier.user_id,
        //     { is_supplier: false },
        //     { trx }
        // )
        await Supplier.updateSupplierById(supplier.id, { status }, { trx })

        return true
    })
    console.log(status)

    return {
        is_success,
    }
}

exports.getUserPartner = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    option.partner_id = user.partner_id
    option.tenant_id = user.tenant_id

    const data = await User.getUserPartnerListing(option, query)

    data.data = data.data.map((item) => {
        item.roles = item.roles.filter((i) => i)
        delete item.is_supplier
        delete item.is_admin
        delete item.is_seller
        delete item.is_deleted
        delete item.facebook_metadata
        delete item.google_metadata
        delete item.last_webpush_player_id

        return item
    })

    return {
        is_success: true,
        ...data,
    }
}

exports.getUserPartnerDetail = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplier = await Supplier.getSupplier({ user_id: user.id })
    const partners = await User.getUserPartnerDetail({
        partner_id: user.partner_id,
        user_id: id,
        supplier_id: supplier?.id,
    })

    partners.map((item) => {
        item.roles = item.roles.filter((i) => i)
        delete item.is_supplier
        delete item.is_admin
        delete item.is_deleted
        delete item.is_seller
        delete item.facebook_metadata
        delete item.google_metadata
        delete item.last_webpush_player_id

        return item
    })

    return {
        is_success: true,
        data: partners[0],
    }
}

exports.getUserListStore = async (request) => {
    const { user } = request
    if (user.account_type !== ACC_TYPE.SELLER)
        throw new Error('user is not a seller')

    const option = parseOption(request.query)

    const data = await User.getUserDetail(user.id)
    option.partner_id = data?.partner_id
    const result = await Store.getStoreListing(option, request.query)

    return {
        is_success: true,
        ...result,
    }
}
exports.adminCreateUser = async (request) => {
    const { user } = request
    const { source, ...value } = await Joi.object()
        .keys({
            email: Joi.string().email().required(),
            full_name: Joi.string(),
            role_ids: Joi.array().items(Joi.string()).required(),
            // source_ids: Joi.array().items(Joi.string()),
            source: Joi.string(),
        })
        .validateAsync({ ...request.body, source: request.odii_source })

    const options = {
        partner_id: user.partner_id,
    }

    const values = {
        ...value,
        tenant_id: user.tenant_id,
    }

    const data = await adminCreateUser(values, options, source)

    return {
        is_success: true,
        ...data,
    }
}
