const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getDesigns = async (options = {}, whereCondition) => {
    let query = knex.select().from('design')
    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('title', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'description',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                return builder
            })
        }
    }

    const result = await query
        .orderBy(options.order_by || 'design.id', options.order_direction)
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

exports.insertDesign = (data, { trx } = {}) =>
    knex('design', trx).returning('id').insert(data)

exports.updateDesign = (condition, data) =>
    knex('design').update(data).where(condition)

exports.updateDesignById = (id, data, { trx } = {}) =>
    exports.updateDesign({ id }, data, trx)

exports.getDesign = (condition) => knex.first().from('design').where(condition)

exports.getDesignById = (id) => exports.getDesign({ id })

exports.getDesignsByIdsAndTemplateId = ({ ids, template_id }, { trx } = {}) =>
    knex('design', trx)
        .select('id')
        .whereIn('id', ids)
        .andWhere('artwork_template_id', template_id)

exports.upsertDesign = async (data, { trx }) => {
    const insertData = data.filter((i) => !i.id)

    if (!_.isEmpty(insertData)) await exports.insertDesign(insertData, { trx })

    const updateData = data.filter((i) => !!i.id)

    if (!_.isEmpty(updateData)) {
        const queries = updateData.map((item) => {
            const { id, artwork_template_id, ...updateBody } = item

            const query = getKnex('design', trx)
                .where({ id, artwork_template_id })
                .update(updateBody)

            return query
        })

        await Promise.all(queries)
    }

    return true
}
