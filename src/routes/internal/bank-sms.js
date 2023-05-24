const Joi = require('joi')
const SMSBank = require('../../models/sms-bank')
const RequireRoles = require('../../utils/require-permision.helper')
const TransactionService = require('../../services/transaction.service')
const Transaction = require('../../models/transaction')
const { TRANSACTION_STATUS, BOT_USER_ID } = require('../../constants')

// todo: move to worker
async function handleTransaction(smsbank_id, code) {
    const transaction = await Transaction.getTransactionForSMSConfirm(code)
    if (!transaction) throw new Error('invalid_transaction')

    await TransactionService.confirmBankTransfer(transaction.id, {
        status: TRANSACTION_STATUS.SUCCEEDED,
        note: 'Xác nhận qua tin nhắn',
        source: 'admin',
        user_id: BOT_USER_ID,
    })

    await SMSBank.updateById(smsbank_id, {
        completed_at: new Date().toISOString(),
        transaction_id: transaction.id,
    })
}

async function routes(fastify) {
    RequireRoles.validateInternalAccessHook(fastify)

    fastify.post('/add-sms-bank-transfer', async (request) => {
        const value = await Joi.object()
            .keys({
                type: Joi.string().required(),
                sender: Joi.string().required(),
                content: Joi.string().required(),
                code: Joi.string().required(),
                send_time: Joi.date().required(),
                received_time: Joi.date().required(),
            })
            .validateAsync({ ...request.body }, { stripUnknown: true })

        const [id] = await SMSBank.insert({ data: value, ...value })

        try {
            handleTransaction(id, value.code)
        } catch (error) {
            console.log('handleTransaction error ', error)
        }

        return {
            is_success: true,
            message: 'success',
            data: { id },
        }
    })
}

module.exports = routes
