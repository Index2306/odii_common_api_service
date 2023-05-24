const { knex, getKnex } = require('../connections/pg-general')

exports.insertPartner = (data, { trx } = {}) =>
    getKnex('partner', trx).returning('id').insert(data)

exports.getPartners = () => knex.select().from('partner')

exports.getPartnerById = (partnerId) =>
    knex.first().from('partner').where('id', partnerId)
