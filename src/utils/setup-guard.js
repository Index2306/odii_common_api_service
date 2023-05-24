const fastifyGuard = require('fastify-guard')
const _ = require('lodash')
const jwt = require('fastify-jwt')
const User = require('../models/user')
const Tenant = require('../models/tenant')
const config = require('../config')
const { redisClient } = require('../connections/redis-cache')
const { ADMIN_ROLES, ACC_TYPE } = require('../constants/index')

module.exports = (fastify) => {
    fastify.register(jwt, {
        secret: config.JWT_ACCESS_SECRET,
    })
    fastify.decorate('authenticate', async (request, reply) => {
        try {
            const payload = await request.jwtVerify()
            if (!payload) throw new Error('invalid_token')

            const cacheKey = `jwt_user_${payload.id}`
            const cacheJwtUser = await redisClient.getObject(cacheKey)
            if (cacheJwtUser) {
                request.user = cacheJwtUser

                return
            }

            console.log('payload = ', payload)
            const userDetail = await User.getUserDetailForAuth(
                payload.id,
                payload.source,
                payload.tenant_id,
            )

            const tenantDetail = await Tenant.getDomainByTenantId(
                payload.tenant_id
            )

            const subscriptDetail = await Tenant.getSubscription({
                tenant_id: payload.tenant_id
            })

            if(tenantDetail?.status === 'inactive') {
                throw new Error('tenant_inactive')
            }
            if(subscriptDetail?.status === 'inactive' && userDetail?.account_type !== ACC_TYPE.ADMIN) {
                throw new Error('subscription_has_expired')
            }
            if (!userDetail?.id) throw new Error('invalid_token')
            // console.log('user detail', userDetail)
            if (userDetail?.status === 'inactive') {
                throw new Error('user_inactive')
            }
            if (!_.isEmpty(userDetail?.roles) && userDetail?.roles[0]) {
                userDetail.roles = userDetail.roles
                    .filter((role) => !!role)
                    .map((r) => r.title)
            } else {
                userDetail.roles = []
            }
            request.user = userDetail
            redisClient.setObjectEx(cacheKey, 20, userDetail)
        } catch (err) {
            console.log('err.message = ', err.message)
            reply.code(401).send({
                is_success: false,
                error_code:
                    err.message === 'Authorization token expired'
                        ? 'token_expired'
                        : 'unauthorized',
                error_message: err.message,
            })
        }
    })

    fastify.decorate('loginonly', async (request, reply) => {
        try {
            const payload = await request.jwtVerify()
            if (!payload) throw new Error('invalid_token')

            const cacheKey = `jwt_user_${payload.id}`
            const cacheJwtUser = await redisClient.getObject(cacheKey)
            if (cacheJwtUser) {
                request.user = cacheJwtUser

                return
            }
            console.log('payload Access token = ', payload)
            const userDetail = await User.getUserDetailForAuth(payload.id)
            if (!userDetail?.id) throw new Error('invalid_token')

            request.user = userDetail
        } catch (err) {
            console.log('err.message = ', err.message)
            reply.code(401).send({
                is_success: false,
                error_code:
                    err.message === 'Authorization token expired'
                        ? 'token_expired'
                        : 'unauthorized',
                error_message: err.message,
            })
        }
    })

    fastify.register(fastifyGuard, {
        roleProperty: 'roles',
        errorHandler: (err, req, reply) =>
            reply.code(403).send({
                is_success: false,
                error_code: 'role_denied',
                error_message:
                    'Bạn không có quyền truy cập hoặc thực hiện hành động',
            }),
    })
}
