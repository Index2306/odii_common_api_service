const _ = require('lodash')
const { knex } = require('../connections/pg-general')

exports.getTemplates = async (options = {}, whereCondition) => {
    let query = knex.select().from('artwork_template')
    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'description',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                return builder
            })
        }
    }

    if (options.tenant_id)
        query = query.andWhere('tenant_id', options.tenant_id)


    const result = await query
        .orderBy(
            options.order_by || 'artwork_template.id',
            options.order_direction
        )
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

exports.insertTemplate = (data, { trx } = {}) =>
    knex('artwork_template', trx).returning('id').insert(data)

exports.updateTemplate = (condition, data) =>
    knex('artwork_template').update(data).where(condition)

exports.updateTemplateById = (id, data, { trx } = {}) =>
    exports.updateTemplate({ id }, data, { trx })

exports.getTemplate = (condition) =>
    knex.first().from('artwork_template').where(condition)

exports.getDetailTemplate = async (options = {}) => {
    const condition = {
        'artwork_template.is_deleted': false,
    }
    if (options.id) condition['artwork_template.id'] = options.id
    if (options.type) condition['artwork_template.type'] = options.type
    if (options.status) condition['artwork_template.status'] = options.status
    if (options.display_status)
        condition['artwork_template.display_status'] = options.display_status
    if (options.design_status)
        condition['design.status'] = options.design_status
    if (options.tenant_id)
        condition['artwork_template.tenant_id'] = options.tenant_id

    const result = await knex
        .select([
            'artwork_template.*',
            knex.raw(`json_agg("design".*) as designs`),
        ])
        .from('artwork_template')
        .first()
        .where(condition)
        .joinRaw(
            `LEFT JOIN design ON design.artwork_template_id = artwork_template.id AND design.is_deleted = false`
        )
        .groupBy('artwork_template.id')
    if (result.designs) result.designs = _.compact(result.designs)

    return result
}

exports.getTemplateById = (id, options = {}) =>
    exports.getDetailTemplate({ id, ...options })

exports.cloneTemplate = async (partner_id, tenant_id) => {
    await knex.raw(`call public.clone_template_design(${partner_id}, '${tenant_id}'::uuid)`)
}