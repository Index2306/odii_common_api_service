const { getKnex } = require('../connections/pg-general')

exports.insertHistory = (data, { trx } = {}) =>
    getKnex('product_inventory_history', trx).returning('id').insert(data)

exports.insertHistories = (data, { trx } = {}) =>
    getKnex('product_inventory_history', trx)
        .returning('id')
        .insert(data)
        .onConflict('id')
        .ignore()
