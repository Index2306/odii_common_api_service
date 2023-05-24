/* eslint-disable consistent-return */
/* eslint-disable no-restricted-syntax */
const _ = require('lodash')
const BlueBird = require('bluebird')
const { knex } = require('../connections/pg-general')
const { redisClient } = require('../connections/redis-cache')
const { esClient } = require('../connections/elasticsearch')
const { PRODUCT_CAT_ES_INDEX, PLATFORM_CAT_ES_INDEX } = require('../config')

exports.getCategories = async (options = {}, whereCondition) => {
    let query = knex
        .select(['parent.*', knex.raw(`json_agg(children.*) as children`)])
        .from('product_category as parent')
        .leftJoin(
            'product_category as children',
            'children.parent_id',
            'parent.id'
        )
        .whereNull('parent.parent_id')
        .groupBy('parent.id')
    if (!_.isEmpty(whereCondition)) {
        const condition = {}
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where(
                        'parent.name',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                    .orWhere(
                        'parent.description',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )
                if (parseInt(whereCondition.keyword, 10))
                    builder.orWhere('id', parseInt(whereCondition.keyword, 10))

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

async function getChildrentOfCat(parentCat) {
    if (parentCat.leaf === true) return parentCat
    const children =
        (await knex
            .select()
            .from('product_category')
            .where({ parent_id: parentCat.id, status: 'active' })
            .orderBy('priority', 'asc')) || []

    parentCat.children = await BlueBird.map(
        children,
        (cat) => getChildrentOfCat(cat),
        { concurrency: 5 }
    )

    return parentCat
}

exports.getMany = (limit, offset) =>
    knex
        .select()
        .from('product_category')
        .limit(limit)
        .offset(offset)
        .orderBy('id', 'asc')

exports.getCategoriesTree = async (options = {}) => {
    let query = knex
        .select()
        .from('product_category')
        .where({ level: 1 })
        .orderBy('priority', 'asc')

    if (options.status) {
        query = query.andWhere('status', options.status)
    }

    const tmp1 = await BlueBird.map(query, (cat) => getChildrentOfCat(cat), {
        concurrency: 5,
    })
    // const categories = tmp1.map((item) => {
    //     if (item?.length === 1) {
    //         if (!_.isEmpty(item[0].children)) {
    //             item[0].children = item[0].children.sort(
    //                 (a, b) => a.priority - b.priority
    //             )

    //             return item[0]
    //         }

    //         return item[0]
    //     }
    //     const foo = item[0]
    //     foo.children = _.flatten(_.concat(item.map((i) => i.children))).sort(
    //         (a, b) => a.priority - b.priority
    //     )

    //     return foo
    // })

    // categories.sort((a, b) => a.priority - b.priority)

    return tmp1

    // return tmp1
}
exports.adminGetCategoriesTree = async (options = {}) => {
    let query = knex
        .select()
        .from('product_category')
        .orderBy('priority', 'asc')

    if (options.status) {
        query = query.andWhere('status', options.status)
    }
    // if (options.tenant_id) {
    //     query = query.andWhere('tenant_id', options.tenant_id)
    // } 

    return query
}

exports.insertCategory = (data) =>
    knex('product_category').returning('id').insert(data)

exports.insertCategoryField = (data) =>
    knex('product_category_field').returning('id').insert(data)

exports.updateCategory = (condition, data) =>
    knex('product_category').update(data).where(condition)

exports.updateCategoryById = (id, data) => exports.updateCategory({ id }, data)

exports.getCategory = (condition) =>
    knex.first().from('product_category').where(condition)

exports.getStoreCatAttr = (condition) =>
    knex.first().from('store_category_attribute').where(condition)

exports.getCategoryById = (id) =>
    knex.select().first().from('product_category').where('id', id)

exports.getProductCategoriesByProductId = async (productId) => {
    const product = await knex
        .select(['pc.*'])
        .from('product_category as pc')
        .innerJoin(
            'product_category_vs_product as pcp',
            'pcp.product_category_id',
            'pc.id'
        )
        .where('pcp.product_id', productId)

    return product
}

exports.getListing = async (options = {}, whereCondition = {}) => {
    let query = knex.select().from('product_category')
    if (whereCondition.keyword) {
        query = query.where((builder) => {
            builder.where(
                'search_txt',
                'ilike',
                `%${whereCondition.search_txt}%`
            )
            if (parseInt(whereCondition.keyword, 10))
                builder.orWhere('id', parseInt(whereCondition.keyword, 10))

            return builder
        })
    }

    // if (options.tenant_id) {
    //     query = query.andWhere('product_category.tenant_id', options.tenant_id)
    // } 

    if (whereCondition.is_top === true) {
        query.where({
            parent_id: null,
        })
    }
    if (whereCondition.is_leaf === true || whereCondition.is_leaf === false) {
        query.where({
            leaf: whereCondition.is_leaf,
        })
    }
    if (whereCondition.parent_id) {
        query.where({
            parent_id: whereCondition.parent_id,
        })
    }
    if (whereCondition.ids) {
        query.whereIn('id', whereCondition.ids)
    }

    const result = await query
        .orderBy('priority', 'asc')
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

exports.getTopCategoryForProduct = async (
    childrenCategoryId,
    isCache = true
) => {
    if (!childrenCategoryId) return
    let allCat
    if (isCache) {
        allCat = await redisClient.getObject('all_odii_cat')
        if (!allCat) {
            allCat = await exports.getMany(10000, 0)
            redisClient.setObject('all_odii_cat', allCat)
        }
    } else {
        allCat = await exports.getMany(10000, 0)
    }

    const childrenCategory = allCat.find((c) => c.id === childrenCategoryId)
    if (!childrenCategory) return
    const result = [childrenCategory]
    function findParentCat(childCat) {
        if (!childCat.parent_id) return
        const parentCat = allCat.find((c) => c.id === childCat.parent_id)
        if (!parentCat) return
        result.unshift(parentCat)
        if (!parentCat.parent_id) return

        return findParentCat(parentCat)
    }

    findParentCat(childrenCategory)

    return result
}
exports.getCateFieldListing = async (options = {}, whereCondition) => {
    let query = knex.select().from('product_category_field')
    if (!_.isEmpty(whereCondition)) {
        query = query.where('is_deleted', false)
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder
                    .where('name', 'ilike', `%${whereCondition.keyword}%`)
                    .orWhere(
                        'input_type',
                        'ilike',
                        `%${whereCondition.keyword}%`
                    )

                return builder
            })
        }
    }

    const result = await query
        .orderBy(
            options.order_by || 'product_category_field.id',
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

exports.getCategoryField = (condition) =>
    knex.first().from('product_category_field').where(condition)

exports.getCategoryFieldById = (id) => exports.getCategoryField({ id })

exports.updateCategoryField = (condition, data) =>
    knex('product_category_field').update(data).where(condition)

exports.updateCategoryFieldById = (id, data) =>
    exports.updateCategoryField({ id }, data)

// setTimeout(async () => {
//     console.log('run getTopCategoryForProduct')
//     const result = await exports.getTopCategoryForProduct('10')
//     console.log('result = ', result)
// }, 2000)

exports.getStoreCategoryAttrs = (index, limit = 20) =>
    knex
        .from('store_category_attribute')
        .limit(limit)
        .offset(index * limit)

exports.suggestProductCateByKeyword = async (query = {}, from, size) => {
    const baseQuery = {
        query: {
            bool: {
                must: [],
                must_not: [],
                should: [],
            },
        },
    }

    if (query.keyword && query.keyword.length > 1) {
        baseQuery.query.bool.must.push({
            match: {
                cat_path: query.keyword,
            },
        })
    }

    if (query.is_leaf === true || query.is_leaf === false) {
        baseQuery.query.bool.must.push({
            match: {
                leaf: query.is_leaf,
            },
        })
    }

    if (query.parent_id) {
        baseQuery.query.bool.must.push({
            term: {
                parent_id: query.parent_id,
            },
        })
    }
    if (query.is_top) {
        baseQuery.query.bool.must.push({
            term: {
                level: 1,
            },
        })
    }

    return esClient
        .search({
            index: PRODUCT_CAT_ES_INDEX,
            from,
            size,
            body: baseQuery,
        })
        .then((result) => ({
            data: result.body.hits.hits,
            total: result.body.hits.total.value,
        }))
        .catch((error) => {
            console.log('suggestProductCateByKeyword err ', error)

            return []
        })
}
exports.suggestProductCateByProductName = async (query = {}, from, size) => {
    const baseQuery = {
        query: {
            bool: {
                must: [],
                must_not: [],
                should: [],
            },
        },
    }

    if (query.keyword && query.keyword.length > 1) {
        baseQuery.query.bool.must.push({
            match: {
                suggest_by_pName: query.keyword,
            },
        })
    }

    if (query.is_leaf) {
        baseQuery.query.bool.must.push({
            match: {
                leaf: query.is_leaf,
            },
        })
    }

    if (query.parent_id) {
        baseQuery.query.bool.must.push({
            term: {
                parent_id: query.parent_id,
            },
        })
    }
    if (query.is_top) {
        baseQuery.query.bool.must.push({
            term: {
                level: 1,
            },
        })
    }

    return esClient
        .search({
            index: PRODUCT_CAT_ES_INDEX,
            from,
            size,
            body: baseQuery,
        })
        .then((result) => ({
            data: result.body.hits.hits,
            total: result.body.hits.total.value,
        }))
        .catch((error) => {
            console.log('suggestProductCateByKeyword err ', error)

            return []
        })
}

exports.searchPlatformCategory = async (query = {}, from, size) => {
    const baseQuery = {
        query: {
            bool: {
                must: [],
                must_not: [],
                should: [],
            },
        },
    }

    if (query.keyword && query.keyword.length > 1) {
        baseQuery.query.bool.must.push({
            match: {
                display_path: query.keyword,
            },
        })
    }

    if (query.parent_id) {
        baseQuery.query.bool.must.push({
            term: {
                parent_id: query.parent_id,
            },
        })
    }
    if (query.is_leaf) {
        baseQuery.query.bool.must.push({
            match: {
                leaf: query.is_leaf,
            },
        })
    }

    if (query.parent_id) {
        baseQuery.query.bool.must.push({
            term: {
                parent_id: query.parent_id,
            },
        })
    }
    if (query.is_top) {
        baseQuery.query.bool.must.push({
            term: {
                level: 1,
            },
        })
    }

    return esClient
        .search({
            index: PLATFORM_CAT_ES_INDEX,
            from,
            size,
            body: baseQuery,
        })
        .then((result) => ({
            data: result.body.hits.hits,
            total: result.body.hits.total.value,
        }))
        .catch((error) => {
            console.log(' err ', error)

            return []
        })
}
