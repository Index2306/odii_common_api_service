const Joi = require('joi')
const _ = require('lodash')
const Role = require('../models/role')
const User = require('../models/user')
const Supplier = require('../models/supplier')
const ProductSource = require('../models/product-source')
const { parseOption } = require('../utils/pagination')
const { STATUS } = require('../constants')
const { knex } = require('../connections/pg-general')

exports.getRoles = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Role.getRoles(option, query)

    return {
        is_success: true,
        ...data,
    }
}
exports.sellerGetRoles = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await Role.getRoles(option, query)

    const newData = data.data.filter(
        (i) => i.title.startsWith('partner') || i.title.startsWith('owner')
    )

    return {
        is_success: true,
        data: newData,
    }
}

exports.createRole = async (request) => {
    const value = await Joi.object()
        .keys({
            title: Joi.string().required(),
            description: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const data = await Role.insertRole(value)
    const success = data[0] !== 0

    return {
        success,
    }
}

exports.updateRole = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            title: Joi.string(),
            description: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const role = await Role.getRoleById(id)

    if (!role) throw new Error('role_id_not_found')

    const data = await Role.updateRoleById(id, body)
    const success = data[0] !== 0

    return {
        success,
    }
}
exports.getRoleDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Role.getRoleById(id)

    if (!data) {
        throw new Error('role_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.updateRolesForUser = async (request) => {
    const { user } = request

    const { user_id, role_ids, source_ids } = await Joi.object()
        .keys({
            user_id: Joi.string().required(),
            role_ids: Joi.array().items().required(),
            source_ids: Joi.array().items().required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const roles = await Role.getRolesByIds(role_ids)
    const sources = await ProductSource.getProductSourceByIds(source_ids)

    if (_.isEmpty(roles)) throw new Error('invalid_role_ids')

    const staffUser = await User.getUserById(user_id)

    if (!staffUser) throw new Error('user_not_found')

    const partnerUser = await User.getPartnerUser({
        partner_id: user.partner_id,
        user_id,
    })
    if (!partnerUser) throw new Error('partner_user_not_found')

    await User.deletePartnerUserRole(partnerUser.id)

    // eslint-disable-next-line no-restricted-syntax
    await User.upsertPartnerUserRole(
        role_ids.map((roleId) => ({
            role_id: roleId,
            partner_user_id: partnerUser.id,
        }))
    )

    if (!_.isEmpty(source_ids)) {
        const supplier = await Supplier.getSupplier({ user_id: user.id })
        const prtSource = await ProductSource.getPrtSources({
            user_id,
            supplier_id: supplier.id,
        })

        prtSource.map((i) =>
            source_ids.map(async (ids) => {
                if (i.id !== ids) {
                    await ProductSource.updateProductSource(
                        { id: i.id },
                        { user_id: null }
                    )
                }
            })
        )

        source_ids.map(async (ids) => {
            await ProductSource.updateProductSource({ id: ids }, { user_id })
        })
    }

    return { is_success: true, data: { user_id, roles, sources } }
}

exports.updateStatusForStaff = async (request) => {
    const { user } = request

    const { user_ids, status } = await Joi.object()
        .keys({
            user_ids: Joi.array().required(),
            status: Joi.string()
                .valid(...Object.values(STATUS))
                .required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const data = await User.getUserPartner(user.partner_id)

    const user_arr_ids = _.intersection(
        user_ids,
        data.map((user) => user.id)
    )

    let isActive = true
    if (status === STATUS.INACTIVE) {
        isActive = false
    }
    await knex.transaction(async (trx) => {
        // eslint-disable-next-line no-restricted-syntax
        for (const user_id of user_arr_ids) {
            // await User.updatePartnerUser(
            //     { user_id, is_owner: true },
            //     { is_active: isActive },
            //     { trx }
            // )
            await User.updateUserById(user_id.id, { status: status })
            // await User.updatePartnerUser(
            //     { user_id },
            //     { is_active: isActive },
            //     { trx }
            // )
            await User.deleteCache(user_id)
        }
    })
    // Clear cache of user

    return { is_success: true, data: user_arr_ids }
}

exports.adminUpdateRolesForUser = async (request) => {
    const { user_id, role_ids } = await Joi.object()
        .keys({
            user_id: Joi.string().required(),
            role_ids: Joi.array().items().required(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    const roles = await Role.getRolesByIds(role_ids)

    if (_.isEmpty(roles)) throw new Error('invalid_role_ids')

    const getUserPartnerRoles = await User.getUserPartnerRoles(user_id)

    await User.deletePartnerUserRole(getUserPartnerRoles.partner_user_id)

    await User.upsertPartnerUserRole(
        role_ids.map((roleId) => ({
            role_id: roleId,
            partner_user_id: getUserPartnerRoles.partner_user_id,
        }))
    )
    // eslint-disable-next-line newline-before-return
    return { is_success: true, data: { user_id, roles } }
}
