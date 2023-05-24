import RequireRoles from '../../utils/require-permision.helper'
import workerQueue from '../../services/worker-queue'

const Joi = require('joi')
const Store = require('../../models/store')
const EmailService = require('../../services/email')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get('/seller/store/:id', async (request) => {
        const { user } = request
        const { id } = await Joi.object()
            .keys({
                id: Joi.string().required(),
            })
            .validateAsync({ ...request.params }, { stripUnknown: true })

        const data = await Store.getStore(id)

        if (!data) {
            throw new Error('store_id_not_found')
        }
        const info = data.data[0].from_user

        if (info == null) {
            throw new Error('user_id_not_found')
        }
        console.log('SENT MAIL CONNECT STORE SUCCESS')
        await EmailService.welcomeConnectStore({
            email: info.email,
            name: data.data[0].name,
            source: user.account_type,
            tenant_id: user.tenant_id,
        })

        return {
            is_success: true,
            data: data.data[0],
        }
    })

    fastify.post('/craw-logo', async (request) => {
        const { url, store_id } = await Joi.object()
            .keys({
                url: Joi.string().required(),
                store_id: Joi.string().required(),
            })
            .validateAsync({ ...request.body }, { stripUnknown: true })

        const data = await workerQueue.updateLogoToWorker(url, store_id)

        return {
            is_success: true,
            ...data,
        }
    })
    fastify.post('/craw-transaction', async (request) => {
        const { url } = await Joi.object()
            .keys({
                url: Joi.string().required(),
            })
            .validateAsync({ ...request.body }, { stripUnknown: true })

        // const data = await workerQueue.updateLogoToWorker(url, store_id)

        return {
            is_success: true,
        }
    })
}

module.exports = routes
