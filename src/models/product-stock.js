/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { some } from 'lodash'
import Logger from '../logger'

const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getOne = (condition) => knex.first().from('product_stock').where(condition)

exports.getOneById = (id) => exports.getOne({ id })

exports.update = (condition, data, { trx } = {}) =>
    getKnex('product_stock', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.insert = (data, { trx } = {}) =>
    getKnex('product_stock', trx).returning('id').insert(data)

exports.insertMany = async (data, { trx }) =>
    await exports.insert(data, { trx })

exports.getOneMapProductById = async (id) => {
    const query = knex
        .select([
            'p.id as product_id',
            'pst.*',
            'p.has_variation'
        ])
        .first()
        .from('product_stock as pst')
        .innerJoin('product as p', 'pst.product_id', 'p.id')
        .where('pst.id', id)
        .groupBy('pst.id', 'p.id')

    const result = await query
    return result
}

exports.decrementQtyProductStock = (product_stock_id, total, { trx } = {}) =>
    getKnex('product_stock', trx)
        .decrement('real_quantity', total)
        .decrement('total_quantity', total)
        .where('id', product_stock_id)

exports.incrementQtyProductStock = (product_stock_id, total, { trx } = {}) =>
    getKnex('product_stock', trx)
        .increment('real_quantity', total)
        .increment('total_quantity', total)
        .where('id', product_stock_id)