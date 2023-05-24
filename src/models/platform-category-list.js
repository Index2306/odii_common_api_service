const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')
const CommonUtil = require('../utils/common.util')

exports.insert = (data, { trx } = {}) =>
    getKnex('platform_category_list', trx).returning('*').insert(data)

exports.upsert = (data, { trx } = {}) =>
    getKnex('platform_category_list', trx)
        .insert(data)
        .onConflict(['shop_cat_id', 'platform'])
        .merge()
        .returning('*')

exports.getMany = async (condition = {}) =>
    knex.select().from('platform_category_list').where(condition)

exports.getListing = async (options = {}, whereCondition = {}) => {
    console.log(
        '🚀 ~ file: platform-category-list.js ~ line 19 ~ exports.getListing= ~ whereCondition',
        whereCondition
    )
    console.log(
        '🚀 ~ file: platform-category-list.js ~ line 19 ~ exports.getListing= ~ options',
        options
    )
    const query = knex.select().from('platform_category_list')

    if (whereCondition.platform) {
        query.andWhere('platform', whereCondition.platform)
    }

    if (options.shopee_cat_id_mapped) {
        query.whereRaw(`ids_path \\?| array['${options.shopee_cat_id_mapped}']`)
    }

    if (options.has_children === true || options.has_children === false)
        query.andWhere('has_children', options.has_children)

    if (whereCondition?.keyword) {
        query.andWhere((builder) => {
            builder.where(
                'search_txt',
                'ilike',
                `%${_.deburr(
                    CommonUtil.nonAccentVietnamese(whereCondition.keyword)
                )}%`
            )

            return builder
        })
    }
    if (whereCondition?.shop_cat_id)
        query.andWhere('shop_cat_id', whereCondition?.shop_cat_id)

    if (!_.isEmpty(options.ids_path)) {
        if (_.isArray(options.ids_path)) {
            console.log(1)
            query.whereRaw(
                `ids_path \\?| array[${options.ids_path
                    .map((item) => `'${item}'`)
                    .join(', ')}]`
            )
        } else {
            console.log(22)
            query.whereRaw(`ids_path \\?| array['${options.ids_path}']`)
        }
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

exports.getOne = async (condition = {}) =>
    knex.select().first().from('platform_category_list').where(condition)

exports.getOneById = async (id) => exports.getOne({ id })

exports.update = (condition, data) =>
    knex('platform_category_list').update(data).where(condition)

exports.getManyByIds = (ids) =>
    knex.from('platform_category_list').whereIn('id', ids)

exports.getManyByShopCatIds = (shop_cat_ids) =>
    knex.from('platform_category_list').whereIn('shop_cat_id', shop_cat_ids)

exports.getMany = (limit, offset) =>
    knex
        .select()
        .from('platform_category_list')
        .limit(limit)
        .offset(offset)
        .orderBy('id', 'asc')
