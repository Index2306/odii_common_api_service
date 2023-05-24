const { knex, getKnex } = require('../connections/pg-general')
const { BALANCE_TYPE } = require('../constants')

exports.insertBalance = (data, { trx } = {}) =>
    getKnex('balance', trx).returning('id').insert(data)

exports.updateBalance = (condition, data, { trx } = {}) =>
    getKnex('balance', trx).update(data).where(condition)

exports.updateBalanceById = (id, data, { trx } = {}) =>
    exports.updateBalance({ id }, data, { trx }).then((result) => {
        if (result == 0)
            throw new Error('Không thể cập nhật thông tin tài khoản')

        return result
    })

exports.getBalance = (condition, { trx } = {}) =>
    getKnex('balance', trx).first().from('balance').where(condition)

exports.getBalances = (condition) =>
    knex.select().from('balance').where(condition)

exports.getBalancesByPartnerId = (partner_id) =>
    exports.getBalances({ partner_id })

exports.getBalanceById = (id, { trx } = {}) =>
    exports.getBalance({ id }, { trx })

exports.getPrimaryBalanceByPartner = (partner_id, { trx } = {}) =>
    exports.getBalance({ partner_id, type: BALANCE_TYPE.PRIMARY }, { trx })

// exports.getSecondaryBalanceByPartner = (partner_id) =>
//     exports.getBalance({ partner_id, type: BALANCE_TYPE.SECONDARY })
exports.getNearestTransactionByPartner = (partner_id, action_type) =>
    getKnex('transaction, trx')
        .first()
        .from('transaction')
        .where({ partner_id, action_type })
        .orderBy('created_at', 'desc')
