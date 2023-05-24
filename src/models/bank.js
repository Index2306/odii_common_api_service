const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getBanks = async (options = {}, whereCondition) => {
    let query = knex
        .select(['bank.*', knex.raw('row_to_json("bank_info".*) as bank_data')])
        .from('bank')
        .leftJoin('bank_info', 'bank_info.id', 'bank.bank_info_id')

    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('title', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        if (whereCondition?.status) condition.status = whereCondition.status
        if (whereCondition?.type) condition.type = whereCondition.type
        if (whereCondition?.is_default)
            condition.is_default = whereCondition.is_default
        if (whereCondition?.partner_id)
            condition.partner_id = whereCondition.partner_id
        if (options?.partner_id) condition.partner_id = options.partner_id
        query = query.andWhere(condition)
    }
    if (options.tenant_id)
        query = query.andWhere('bank.tenant_id', options.tenant_id)

    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
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

exports.insertBank = (data) => knex('bank').returning('id').insert(data)

exports.updateBank = (condition, data) =>
    knex('bank').update(data).where(condition)

exports.updateBankById = (id, data) => exports.updateBank({ id }, data)

exports.getBank = (condition) => knex.first().from('bank').where(condition)

exports.getBankById = (id) => exports.getBank({ id })

exports.getBanksDetail = async (id) => {
    const query = knex
        .select(['bank.*', knex.raw('row_to_json("bank_info".*) as bank_data')])
        .from('bank')
        .first()
        .where('bank.id', id)
        .leftJoin('bank_info', 'bank_info.id', 'bank.bank_info_id')

    return query
}

exports.getBankDetailByPartnerId = async (partnerId) => {
    const query = knex
        .select(['bank.*', knex.raw('row_to_json("bank_info".*) as bank_data')])
        .from('bank')
        .first()
        .where('bank.partner_id', partnerId)
        .andWhere('bank.is_default', true)
        .andWhere('bank.status', 'active')
        .leftJoin('bank_info', 'bank_info.id', 'bank.bank_info_id')

    return query
}

exports.getBanksInfo = async (options = {}, whereCondition) => {
    let query = knex.select().from('bank_info')
    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('title', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        query = query.andWhere(condition)
    }
    const result = await query
        .orderBy(options.order_by || 'id', options.order_direction)
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
exports.deleteDefaultBank = (condition, data) =>
    knex('bank').update(data).where(condition)
