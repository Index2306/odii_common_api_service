const { ROLES } = require('../constants')
const { INTERNAL_SECRET } = require('../config')

const requireRolesBuilder = (fastify, requireRoles, { roles, ...hooks }) => ({
    ...hooks,
    preHandler: [fastify.guard.role(...requireRoles, ...(roles || []))],
})

exports.addParseTokenHook = (fastify) =>
    fastify.addHook('preValidation', fastify.authenticate)

exports.checkLogin = (fastify) =>
    fastify.addHook('preValidation', fastify.loginonly)

exports.validateInternalAccessHook = (fastify) =>
    fastify.addHook('preValidation', async (request, reply) => {
        if (request.headers?.authorization !== INTERNAL_SECRET)
            return reply.code(401).send({
                is_success: false,
                error_code: 'unauthorized',
            })
    })

exports.adminProduct = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.SUPER_ADMIN, ROLES.ADMIN_PRODUCT], args)

exports.adminOrder = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.SUPER_ADMIN, ROLES.ADMIN_ORDER], args)

exports.adminUser = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.SUPER_ADMIN, ROLES.ADMIN_USER], args)

exports.adminBalance = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.SUPER_ADMIN, ROLES.ADMIN_BALANCE], args)

exports.supperAdmin = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.SUPER_ADMIN], args)

// TODO: PARTNER:

exports.partnerAffiliate = (fastify, args = {}) =>
    requireRolesBuilder(
        fastify,
        [
            ROLES.OWNER,
            ROLES.SUPER_ADMIN,
            ROLES.ACCOUNTANT,
            ROLES.CHIEF_ACCOUNTANT,
        ],
        args
    )
exports.partnerOwner = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER], args)
exports.partnerProduct = (fastify, args = {}) =>
    requireRolesBuilder(
        fastify,
        [
            ROLES.OWNER,
            ROLES.PARTNER_PRODUCT,
            ROLES.ADMIN_PRODUCT,
            ROLES.SUPER_ADMIN,
            ROLES.PARTNER_SOURCE,
            ROLES.PARTNER_WAREHOUSE,
            ROLES.PARTNER_CHIEf_WAREHOUSE,
        ],
        args
    )
exports.partnerProductListing = (fastify, args = {}) =>
    requireRolesBuilder(
        fastify,
        [ROLES.OWNER, ROLES.PARTNER_PRODUCT, ROLES.PARTNER_STORE],
        args
    )
exports.partnerOrder = (fastify, args = {}) =>
    requireRolesBuilder(
        fastify,
        [ROLES.OWNER, ROLES.PARTNER_ORDER, ROLES.PARTNER_SOURCE],
        args
    )

exports.partnerUser = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER, ROLES.PARTNER_USER], args)
// requireRolesBuilder(fastify, [ROLES.PARTNER_MEMBER], args)

exports.partnerBalance = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER, ROLES.PARTNER_BALANCE], args)

exports.partnerMember = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER, ROLES.PARTNER_MEMBER, ROLES.PARTNER_CHIEf_WAREHOUSE, ROLES.PARTNER_WAREHOUSE], args)

exports.partnerStore = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER, ROLES.PARTNER_STORE], args)

exports.partnerWarehouse = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.OWNER, ROLES.PARTNER_WAREHOUSE, ROLES.PARTNER_CHIEf_WAREHOUSE], args)

exports.accountant = (fastify, args = {}) =>
    requireRolesBuilder(
        fastify,
        [
            ROLES.ACCOUNTANT,
            ROLES.CHIEF_ACCOUNTANT,
            ROLES.ADMIN_BALANCE,
            ROLES.SUPER_ADMIN,
        ],
        args
    )

exports.chiefAccountant = (fastify, args = {}) =>
    requireRolesBuilder(fastify, [ROLES.CHIEF_ACCOUNTANT], args)

exports.setRateLimit = (max = 2, time_in_second = 2) => ({
    config: {
        rateLimit: {
            max,
            timeWindow: `${time_in_second} second`,
        },
    },
})
