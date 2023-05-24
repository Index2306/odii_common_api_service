const { x } = require('joi')
const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.insertPartnerAffiliate = (data, { trx } = {}) =>
    getKnex('partner_affiliate', trx).returning('id').insert(data)

exports.updatePartnerAffiliate = (condition, data, { trx } = {}) =>
    getKnex('partner_affiliate', trx).update(data).where(condition)

exports.getPartnerAffiliate = (condition) =>
    knex.first().from('partner_affiliate').where(condition)

exports.getPartnerAffiliates = async (condition, queryBuilder) => {
    let result
    const query = knex.from('partner_affiliate').where(condition)
    if (!queryBuilder) {
        result = await query
    } else {
        result = await queryBuilder(query)
    }

    return result
}

exports.getPartnerAffiliateById = (id) => exports.getPartnerAffiliate({ id })

exports.getPartnerAffiliateByOwnCode = (own_affiliate_code) =>
    exports.getPartnerAffiliate({ own_affiliate_code })

exports.getAffiliateForUpdate = () =>
    knex
        .from('partner_affiliate')
        .whereNotNull('partner_affiliate_id')
        .andWhere((builder) =>
            builder.whereNull('partner_affiliate_expiry_date')
        )
exports.countAffByPartnerId = async (options) => {
    const result = knex
        .first()
        .count('id')
        .from('partner_affiliate')
        .where(options)

    return result
}
