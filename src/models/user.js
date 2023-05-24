/* eslint-disable no-return-await */
const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const { redisClient } = require('../connections/redis-cache')
const { ACC_TYPE } = require('../constants')

exports.insertUser = (data, { trx } = {}) =>
    getKnex('user', trx).returning('id').insert(data)

exports.getUsers = () => knex.select().from('user')

exports.getAllUsers = (condition) => knex.select().from('user').where(condition)

exports.getUser = (condition) => knex.first().from('user').where(condition)

exports.getUserById = (id) => exports.getUser({ id })

exports.getUsersByEmail = (email) => knex.from('user').where('email', email)

exports.getUserByEmail = (email) =>
    knex.first().from('user').where('email', email)

exports.getUserWithAuthByEmail = (email, source) =>
    knex
        .select()
        .first()
        .from('user')
        .innerJoin('user_auth', 'user_auth.user_id', 'user.id')
        .where('user.email', email)
        .andWhere('user.account_type', source)

exports.getUserPartnerRoles = (userId) =>
    knex
        .select([
            'partner.*',
            knex.raw(`json_agg(role.*) as roles`),
            knex.raw('partner_user.id as partner_user_id'),
        ])
        .first()
        .from('partner')
        .innerJoin('partner_user', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('partner_user.user_id', userId)
        .andWhere('partner_user.is_active', true)
        .groupBy('partner.id', 'partner_user.id')

exports.getUserPartnerStores = (userId) =>
    knex
        .select([
            'partner.*',
            knex.raw(`json_agg(store.*) as stores`),
            knex.raw('partner_user.id as partner_user_id'),
        ])
        .first()
        .from('partner')
        .innerJoin('partner_user', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_store',
            'partner_user_store.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('store', 'store.id', 'partner_user_store.store_id')
        .where('partner_user.user_id', userId)
        .andWhere('partner_user.is_active', true)
        .groupBy('partner.id', 'partner_user.id')

exports.getUserDetail = async (userId, options = {}) => {
    const query = knex
        .select([
            'user.*',
            knex.raw(`json_agg(role.*) as roles`),
            knex.raw('partner_user.id as partner_user_id'),
            knex.raw('partner_user.is_active as partner_user_is_active'),
            knex.raw('partner_user.is_owner as is_partner_owner'),
            knex.raw('partner.id as partner_id'),
        ])
        .first()
        .from('user')
        .innerJoin('partner_user', 'partner_user.user_id', 'user.id')
        .innerJoin('partner', 'partner.id', 'partner_user.partner_id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('user.id', userId)
        .andWhere('user.is_deleted', false)

    if (!options.is_admin_listing) {
        query
            .andWhere('user.status', 'active')
            .andWhere('partner_user.is_active', true)
    }

    query.groupBy('user.id', 'partner.id', 'partner_user.id')

    const result = await query

    return result
}

// .joinRaw(`INNER JOIN product as sp ON p.product_id = sp.id`)
exports.getUserDetailForAuth = async (userId, accountType, tenantId) => {
    const query = knex
        .select([
            'user.*',
            knex.raw('partner_user.id as partner_user_id'),
            knex.raw('partner_user.is_owner as is_partner_owner'),
            knex.raw('partner_user.is_active as partner_user_is_active'),
            knex.raw('partner.id as partner_id'),
        ])
        .first()
        .from('user')
        .joinRaw(
            `INNER JOIN "partner_user" ON "partner_user".user_id = "user".id AND "partner_user".is_active = true`
        )
        .joinRaw(
            `INNER JOIN "partner" ON "partner_user".partner_id = "partner".id AND "partner".is_deleted = false`
        )
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('user.id', userId)
        .andWhere('user.is_deleted', false)

    if (accountType) query.andWhere('user.account_type', accountType)
    if (tenantId) query.andWhere('user.tenant_id', tenantId)

    query.groupBy('user.id', 'partner.id', 'partner_user.id')

    const user = await query

    const [roles, stores, sources] = await Promise.all([
        knex
            .select('role.*')
            .from('role')
            .leftJoin(
                'partner_user_role',
                'role.id',
                'partner_user_role.role_id'
            )
            .where('partner_user_role.partner_user_id', user.partner_user_id),
        knex
            .select('store.*')
            .from('store')
            .leftJoin(
                'partner_user_store',
                'store.id',
                'partner_user_store.store_id'
            )
            .where('partner_user_store.partner_user_id', user.partner_user_id),

        knex
            .select('product_source.*')
            .from('product_source')
            .where('product_source.user_id', user.id),
    ])

    return { ...user, roles, stores, sources }
}

exports.insertUserAuth = (data, { trx } = {}) =>
    getKnex('user_auth', trx).insert(data)
exports.insertPasswordHistory = (data, { trx } = {}) =>
    getKnex('password_history', trx).insert(data)

exports.getUserAuth = (userId) =>
    knex.first().from('user_auth').where('user_id', userId)

exports.updateUser = (condition, data, { trx } = {}) =>
    getKnex('user', trx).update(data).where(condition)

exports.updateUserById = (id, data, { trx } = {}) =>
    exports.updateUser({ id }, data, { trx })

exports.deleteCache = (userId) => {
    const cacheKey = `jwt_user_${userId}`

    return redisClient.delObject(cacheKey)
}

exports.updateUserAuth = (user_id, data, { trx } = {}) => {
    const query = getKnex('user_auth', trx).update(data).where({ user_id })

    return query
}

exports.getUserAdminListing = async (options = {}, whereCondition) => {
    let query = knex
        .select(['user.*', knex.raw('json_agg(role.*) as roles')])
        .from('user')
        .innerJoin('partner_user', 'user.id', 'partner_user.user_id')
        .innerJoin('partner', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('user.account_type', 'admin')
        .andWhere('user.is_deleted', false)
        .groupBy('partner_user.id', 'user.id', 'partner.id')

    if (options.tenant_id) {
        query = query.andWhere('user.tenant_id', options.tenant_id)
    }
    if (whereCondition.role > 0) {
        query = query.andWhere('role.id', whereCondition.role)
    }
    if (whereCondition.keyword) {
        query = query.where((builder) => {
            builder
                .where('full_name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('email', 'ilike', `%${whereCondition.keyword}%`)

            return builder
        })
    }
    const result = await query
        .orderBy(options.order_by || 'user.id', options.order_direction)
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

exports.getUserListing = async (options = {}, whereCondition) => {
    let query = knex.select().from('user')
    if (!_.isEmpty(whereCondition)) {
        query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('email', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'full_name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere(
                        'first_name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere(
                        'last_name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere('phone', 'ilike', `%${whereCondition.keyword}%`)
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere('id', parseInt(whereCondition.keyword, 10))

                return builder
            })
        }
    }
    const condition = {}
    if (whereCondition?.status) condition.status = whereCondition.status
    if (options.tenant_id) condition.tenant_id = options.tenant_id
    if (whereCondition?.account_type)
        condition.account_type = whereCondition.account_type
    if (whereCondition.is_admin) {
        condition.account_type = ACC_TYPE.ADMIN
    } else {
        query.andWhere('account_type', '!=', ACC_TYPE.ADMIN)
    }
    query.andWhere(condition)
    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
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

exports.insertPartnerUser = (data, { trx } = {}) =>
    getKnex('partner_user', trx).returning('id').insert(data)

exports.updatePartnerUser = (condition, data, { trx } = {}) =>
    getKnex('partner_user', trx).update(data).where(condition)

exports.upsertPartnerUserActive = async (data, { trx } = {}) => {
    const partnerUserCheck = await getKnex('partner_user', trx)
        .first()
        .where(data)
    if (!partnerUserCheck)
        return await getKnex('partner_user', trx)
            .returning('id')
            .insert({
                ...data,
                is_active: true,
            })

    return getKnex('partner_user', trx)
        .returning('id')
        .update({ is_active: true })
        .where(data)
}

exports.getPartnerUser = (condition) =>
    knex.first().from('partner_user').where(condition)

exports.getPartnerUsers = (condition) =>
    knex.from('partner_user').where(condition)

exports.updatePartnerUserActiveByUserIdPartnerId = (
    partner_id,
    user_id,
    is_active
) => exports.updatePartnerUser({ partner_id, user_id }, { is_active })

exports.insertPartnerUserRole = (data, { trx } = {}) =>
    getKnex('partner_user_role', trx)
        .returning('id')
        .insert(data)
        .onConflict(['role_id', 'partner_user_id'])
        .merge()
        .catch((err) => {
            if (err.message.includes('ON CONFLICT')) {
                throw new Error('accepted_inviatation')
            }
            throw err
        })

exports.insertPartnerUserStore = (data, { trx } = {}) =>
    getKnex('partner_user_store', trx).returning('id').insert(data)

exports.upsertPartnerUserRole = (data, { trx } = {}) =>
    getKnex('partner_user_role', trx).returning('id').insert(data)

exports.upsertPartnerUserStore = (data, { trx } = {}) =>
    getKnex('partner_user_store', trx).returning('id').insert(data)

exports.deletePartnerUser = (condition, { trx } = {}) =>
    knex('partner_user', trx).where(condition).del().returning('id')

exports.deletePartnerUserRole = (id, { trx } = {}) =>
    knex('partner_user_role', trx).where('partner_user_id', id).del()

exports.deletePartnerUserStore = (condition = {}, { trx } = {}) =>
    knex('partner_user_store', trx)
        .whereIn('id', condition.ids)
        .andWhere('partner_user_id', condition.partner_user_id)
        .del()
        .returning('id')

exports.getUserPartnerListing = async (options = {}, whereCondition = {}) => {
    let query = knex
        .select([
            'partner_user.is_owner',
            'partner_user.is_active as is_partner_user_active',
            'partner.id as partner_user_id',
            'user.*',
            knex.raw('json_agg(role.*) as roles'),
        ])
        .from('partner_user')
        .innerJoin('user', 'partner_user.user_id', 'user.id')
        .innerJoin('partner', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('partner.id', options.partner_id)
        // .andWhere('user.status', 'active')
        .andWhere('user.is_deleted', false)
        .groupBy('partner_user.id', 'user.id', 'partner.id')

    if (options.tenant_id)
        query = query.andWhere('user.tenant_id', options.tenant_id)

    if (whereCondition.keyword) {
        query = query.where((builder) => {
            builder
                .where('full_name', 'ilike', `%${whereCondition.keyword}%`)
                .orWhere('email', 'ilike', `%${whereCondition.keyword}%`)

            return builder
        })
    }
    const result = await query
        .orderBy(options.order_by || 'partner_user.id', options.order_direction)
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
exports.getUserPartner = async (partner_id, options = {}) => {
    const query = knex
        .select([
            'partner_user.is_owner',
            'partner_user.is_active as is_partner_user_active',
            'partner.id as partner_user_id',
            'user.*',
            knex.raw('json_agg(role.*) as roles'),
            knex.raw('json_agg(product_source.*) as sources'),
        ])
        .from('partner_user')
        .innerJoin('user', 'partner_user.user_id', 'user.id')
        .innerJoin('partner', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .leftJoin('product_source', 'product_source.user_id', 'user.id')
        .where('partner.id', partner_id)
        // .andWhere('user.status', 'active')
        .andWhere('user.is_deleted', false)
        .groupBy('partner_user.id', 'user.id', 'partner.id')

    return query
}

exports.getUserPartnerDetail = async (
    { partner_id, user_id, supplier_id },
    options = {}
) => {
    const query = knex
        .select([
            'partner_user.is_owner',
            'partner_user.is_active as is_partner_user_active',
            'partner.id as partner_user_id',
            'user.*',
            knex.raw('json_agg(role.*) as roles'),
        ])
        .first()
        .from('partner_user')
        .innerJoin('user', 'partner_user.user_id', 'user.id')
        .innerJoin('partner', 'partner_user.partner_id', 'partner.id')
        .leftJoin(
            'partner_user_role',
            'partner_user_role.partner_user_id',
            'partner_user.id'
        )
        .leftJoin('role', 'role.id', 'partner_user_role.role_id')
        .where('partner.id', partner_id)
        .andWhere('user.id', user_id)
        // .andWhere('user.status', 'active')
        .andWhere('user.is_deleted', false)
        .groupBy('partner_user.id', 'user.id', 'partner.id')

    const user = await query

    const [sources] = await Promise.all([
        knex
            .select('product_source.*')
            .from('product_source')
            .where('product_source.user_id', user_id)
            // .andWhere('product_source.supplier_id', supplier_id),
    ])

    return [{ ...user, sources }]
}

exports.deleteUserNotActive = (id) => knex('user').where('id', id).del()

exports.getUserByStatus = (condition) => {
    const query = knex('user')
        .where('status', condition.status)
        .where('created_at', '<=', condition.created_at)

    return query
}

exports.getUserByPartnerId = (partner_id) => exports.getUser({ partner_id })

exports.getPasswordHistory = (condition) =>
    knex
        .from('password_history')
        .where(condition)
        .orderBy('created_at', 'desc')
        .limit(4)

exports.getAllUserAuth = (condition) => {
    const query = knex
        .from('user_auth')
        .where('created_at', '<=', condition.created_at)

    return query
}
