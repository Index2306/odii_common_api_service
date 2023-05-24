const AuthCtl = require('../../controllers/auth')
const { setRateLimit } = require('../../utils/require-permision.helper')

async function routes(fastify) {
    fastify.post('/signup', setRateLimit(100, 3600), AuthCtl.signup)
    fastify.post('/active-user', setRateLimit(100, 3600), AuthCtl.activeUser)
    fastify.post(
        '/verify-invite-user',
        setRateLimit(100, 3600),
        AuthCtl.verifyInvite
    )
    fastify.post(
        '/resend-email-active-user',
        setRateLimit(100, 3600),
        AuthCtl.resendEmailActiveUser
    )
    fastify.post(
        '/reset-password',
        setRateLimit(100, 3600),
        AuthCtl.resetPasswordCtl
    )
    fastify.post('/signin', AuthCtl.signin)
    fastify.get(
        '/refresh',
        // setRateLimit(100, 3600),
        AuthCtl.refreshNewAccessToken
    )
    fastify.post('/forgot', setRateLimit(100, 3600), AuthCtl.forgot)
}

module.exports = routes
