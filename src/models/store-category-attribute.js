const { getKnex, knex } = require('../connections/pg-general')

exports.getMany = (limit, offset) =>
    knex
        .select()
        .from('store_category_attribute')
        .limit(limit)
        .offset(offset)
        .orderBy('id', 'asc')

exports.getAll = () => knex.select().from('store_category_attribute')

exports.getOne = (condition, { trx } = {}) =>
    getKnex('store_category_attribute', trx)
        .first()
        .from('store_category_attribute')
        .where(condition)

exports.getAttrById = (id, { trx } = {}) => exports.getOne({ id }, { trx })

exports.update = (condition, data, { trx } = {}) =>
    // if (data.options) data.options = JSON.stringify(data.options)
    // if (data.advanced) data.advanced = JSON.stringify(data.advanced)

    getKnex('store_category_attribute', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })
