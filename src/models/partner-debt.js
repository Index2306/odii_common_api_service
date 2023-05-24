const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const {
    getBasicStore,
    getBasicWarehousing,
    getBasicLocation,
    getBasicSup,
    getBasicUser,
} = require('./model-helper')

exports.insert = (data, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).insert(data).returning('*')

exports.getMany = async (condition, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).select().where(condition)

exports.getOne = async (condition, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).select().first().where(condition)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).update(data).where(condition)

exports.updateById = (id, data, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).update(data).where('id', id)

exports.getManyByIds = (ids) => knex.from('partner_vs_debt').whereIn('id', ids)

exports.increment = (condition, body, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).increment(body).where(condition)

exports.decrement = (condition, body, { trx } = {}) =>
    getKnex('partner_vs_debt', trx).decrement(body).where(condition)

exports.getListing = async (options = {}, whereCondition) => {
    const query = knex
        .select([
            'partner_vs_debt.*',
            // getBasicSup('supplier', 'supplier'),
            getBasicUser('u', 'user'),
            'u.account_type',
        ])
        .from('partner_vs_debt')
        .joinRaw(
            `INNER JOIN "partner" ON "partner".id = "partner_vs_debt".partner_id`
        )
        .joinRaw(`INNER JOIN "user" as u ON "u".id = "partner".user_id`)
    // .joinRaw(
    //     `INNER JOIN "supplier" ON "supplier".partner_id = "partner_vs_debt".partner_id`
    // )

    if (options?.tenant_id)
        query.andWhere('partner_vs_debt.tenant_id', options.tenant_id)

    if (whereCondition?.debt_period_key)
        query.andWhere('debt_period_key', whereCondition.debt_period_key)

    if (whereCondition?.payout_period_key)
        query.andWhere('payout_period_key', whereCondition.payout_period_key)

    const result = await query
        .orderBy('total_revenue', 'desc')
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}

exports.getOverviewStats = async (whereCondition) => {
    const query = knex
        .select([
            'partner_vs_debt.*',
            'debt_period.payout_period_start',
            knex.raw('u1.full_name as accountant_confirm_by'),
            knex.raw('u2.full_name as partner_confirm_by'),
            knex.raw('u3.full_name as chief_accountant_confirm_by'),
        ])
        .first()
        .from('partner_vs_debt')
        .innerJoin(
            'debt_period',
            'debt_period.key',
            'partner_vs_debt.debt_period_key'
        )
        .leftJoin(
            'user as u1',
            'u1.id',
            'partner_vs_debt.accountant_confirm_by_user_id'
        )
        .leftJoin(
            'user as u2',
            'u2.id',
            'partner_vs_debt.partner_confirm_by_user_id'
        )
        .leftJoin(
            'user as u3',
            'u3.id',
            'partner_vs_debt.chief_accountant_confirm_by_user_id'
        )
    if (whereCondition?.id) {
        query.andWhere('partner_vs_debt.id', whereCondition.id)
    }
    if (whereCondition?.debt_period_key)
        query.andWhere('debt_period_key', whereCondition.debt_period_key)

    if (whereCondition?.payout_period_key)
        query.andWhere('payout_period_key', whereCondition.payout_period_key)

    if (whereCondition?.partner_id)
        query.andWhere('partner_id', whereCondition.partner_id)

    const result = await query

    return result
}

exports.getListingV2 = async (options = {}, whereCondition) => {
    const query = knex
        .select([
            'partner_vs_debt.*',
            'deb.debt_period_start',
            'deb.debt_period_end',
            'deb.payout_period_start',
            'deb.payout_period_end',
            knex.raw('u1.full_name as accountant_confirm_by'),
            knex.raw('u2.full_name as partner_confirm_by'),
            knex.raw('u3.full_name as chief_accountant_confirm_by'),
        ])
        .from('partner_vs_debt')
        .innerJoin(
            'debt_period as deb',
            'deb.key',
            'partner_vs_debt.debt_period_key'
        )
        .leftJoin(
            'user as u1',
            'u1.id',
            'partner_vs_debt.accountant_confirm_by_user_id'
        )
        .leftJoin(
            'user as u2',
            'u2.id',
            'partner_vs_debt.partner_confirm_by_user_id'
        )
        .leftJoin(
            'user as u3',
            'u3.id',
            'partner_vs_debt.chief_accountant_confirm_by_user_id'
        )

    if (options?.tenant_id)
        query.andWhere('deb.tenant_id', options.tenant_id)

    if (whereCondition?.debt_period_key)
        query.andWhere('debt_period_key', whereCondition.debt_period_key)

    if (whereCondition?.payout_period_key)
        query.andWhere('payout_period_key', whereCondition.payout_period_key)

    if (whereCondition?.partner_id)
        query.andWhere('partner_id', whereCondition.partner_id)

    const result = await query
        .orderBy('deb.debt_period_start', 'desc')
        .paginate(options.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options.page,
            page_size: options.page_size,
        },
        data: result.data,
    }
}
