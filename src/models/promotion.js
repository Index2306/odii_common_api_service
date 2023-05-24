const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.getPromotions = async (options = {}, whereCondition) => {
    let query = knex
        .select('promotion.*')
        .from('promotion')
        .where('promotion.is_deleted', false)
        .groupBy('promotion.id')

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query = query.where((builder) => {
                builder.where('name', 'ilike', `%${whereCondition.keyword}%`)

                return builder
            })
        }
        if (whereCondition.status_validate) {
            query = query.where((builder) => {
                builder.where(
                    'status_validate',
                    'ilike',
                    `%${whereCondition.status_validate}%`
                )

                return builder
            })
        }
    }

    if (options?.supplier_id) {
        query = query.where('promotion.supplier_id', options?.supplier_id)
    }

    if (options?.created_by && !options?.isOwner) {
        query = query.andWhere('created_by', options?.created_by)
    }

    const result = await query
        .orderBy(options?.order_by || 'promotion.id', options?.order_direction)
        .paginate(options?.paginate)

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options?.page,
            page_size: options?.page_size,
        },
        data: result.data,
    }
}

exports.getPromotion = (condition) =>
    knex.first().from('promotion').where(condition)

exports.getAllPromotions = (condition) =>
    knex.from('promotion').where(condition)

exports.insertPromotion = (data, { trx } = {}) =>
    getKnex('promotion', trx).returning('id').insert(data)

exports.getPromotionById = async (id, options = {}) => {
    let query = knex
        .select('promotion.*')
        .first()
        .from('promotion')
        .where('is_deleted', false)
        .andWhere('promotion.id', id)
        .groupBy('promotion.id')

    if (options?.supplier_id) {
        query = query.where('promotion.supplier_id', options?.supplier_id)
    }

    let [products] = await Promise.all([
        knex
            .select(
                'pr.*',
                knex.raw(
                    `json_build_object('sku', pv.sku, 'productName', p.name, 'price', pv.origin_supplier_price, 'thumb', p.thumb) as variation`
                )
            )
            .from('promotion_product as pr')
            .innerJoin('product as p', 'pr.product_id', 'p.id')
            .innerJoin('product_variation as pv', 'pr.variation_id', 'pv.id')
            .where('pr.promotion_id', id)
            .groupBy('pr.id', 'pv.id', 'p.id'),
    ])

    const allData = products.map(async (item) => {
        item.option = await exports.getPromotionProductOption({
            promotion_product_id: item.id,
        })

        return item
    })

    products = await Promise.all(allData)

    query = await query

    return [{ ...query, products }]
}

exports.update = (condition, data, { trx } = {}) =>
    getKnex('promotion', trx).where(condition).update(data)

exports.updateById = (id, data, { trx } = {}) =>
    exports.update({ id }, data, { trx })

exports.getPromotionProducts = (condition) =>
    knex.from('promotion_product').where(condition)

exports.getPromotionProductById = (id) =>
    knex.first().from('promotion_product').where('id', id)

exports.insertPromotionProduct = (data, { trx } = {}) =>
    getKnex('promotion_product', trx).returning('id').insert(data)

exports.upsertPromotion = async (data, { trx }) => {
    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map(async (item) => {
            const { id, promotion_id, ...updateBody } = item
            const query = knex('promotion_product', trx)
                .where({ id, promotion_id })
                .update(updateBody)

            return query
        })
        await Promise.all(queries)
    }
}

exports.upsertPromotionOption = async (data, { trx }) => {
    const insertData = data.filter((item) => !item.id)
    if (!_.isEmpty(insertData))
        await exports.insertPromotionProductOption(insertData)

    const updateData = data.filter((i) => !!i.id)
    if (!_.isEmpty(updateData)) {
        const queries = updateData.map(async (item) => {
            const { id, promotion_product_id, ...updateBody } = item

            const query = knex('promotion_product_option', trx)
                .where({ id, promotion_product_id })
                .update(updateBody)

            return query
        })
        await Promise.all(queries)
    }
}

exports.getPromotionProductsByPromotionId = async (
    promotionId,
    options = {}
) => {
    const condition = {
        'promotion_product.is_deleted': false,
        'promotion_product.promotion_id': promotionId,
    }
    if (options?.status) condition['promotion_product.status'] = options?.status
    const promotion_product = await knex
        .select('promotion_product.*')
        .from('promotion_product')
        .where(condition)
        .orderBy('promotion_product.id', 'desc')

    return promotion_product
}

exports.getPromotionDetailOnly = async (id, options = {}) => {
    const condition = { 'promotion.is_deleted': false }
    if (options?.partner_id)
        condition['promotion.partner_id'] = options?.partner_id
    if (options?.status) condition['promotion.status'] = options?.status
    if (options?.publish_status)
        condition['promotion.publish_status'] = options?.publish_status

    const [promotion, promotion_product] = await Promise.all([
        knex
            .select(['promotion.*'])
            .from('promotion')
            .first()
            .where(condition)
            .andWhere('promotion.id', id)
            .groupBy('promotion.id'),
        exports.getPromotionProductsByPromotionId(id),
    ])

    return { ...promotion, promotion_product }
}

exports.getListDisCountPromotion = async (
    promotionId,
    options = {},
    whereCondition
) => {
    const arrSelectQuantity = [
        knex.raw(`min(oi.payment_status_promotion) as payment_status`),
        knex.raw(`min(oi.product_variation_id) as variation_id`),
        knex.raw(`min(oi.product_name) as product_name`),
        knex.raw(`min(oi.product_variation_name) as product_variation_name`),
        knex.raw(`min(pp.origin_supplier_price) as origin_supplier_price`),
        knex.raw(`row_to_json(u.*) as user`),
        knex.raw(`sum(oi.quantity) as quantity`),
        knex.raw(`row_to_json(p.*) as promotion`),
        knex.raw(`min(pp.id) as promotion_product_id`),
    ]

    const arrSelectProduct = [
        'oi.product_name',
        'pp.origin_supplier_price',
        'pp.value',
        'oi.quantity',
        'oi.supplier_promition_amount',
        'pp.type',
        'oi.product_variation_name',
        'oi.payment_status_promotion as payment_status',
        knex.raw(`row_to_json(u.*) as user`),
    ]

    const query = knex
        .select(
            whereCondition.isQuantity ? arrSelectQuantity : arrSelectProduct
        )
        .from('order_item as oi')
        .innerJoin('order as o', 'oi.order_id', 'o.id')
        .innerJoin('user as u', 'o.seller_confirmed_by', 'u.id')
        .leftJoin('promotion as p', 'oi.promotion_id', 'p.id')

        .joinRaw(
            `INNER JOIN promotion_product AS pp ON pp.promotion_id = oi.promotion_id AND pp.variation_id = oi.product_variation_id`
        )
        .where('oi.promotion_id', promotionId)

    if (!_.isEmpty(whereCondition)) {
        if (whereCondition.keyword) {
            query.where((builder) => {
                builder.where(
                    'oi.product_name',
                    'ilike',
                    `%${whereCondition.keyword}%`
                )

                return builder
            })
        }
        if (whereCondition.payment_status) {
            query.where((builder) => {
                builder.where(
                    'payment_status_promotion',
                    whereCondition.payment_status
                )

                return builder
            })
        }
    }

    if (options?.supplier_id) {
        query.where('p.supplier_id', options?.supplier_id)
    }

    if (options?.created_by && !options?.isOwner) {
        query.andWhere('p.created_by', options?.created_by)
    }

    if (whereCondition.isQuantity) {
        query.andWhere('o.odii_status', 5)
        query.groupBy(
            'oi.product_variation_id',
            'u.id',
            'pp.id',
            'p.id',
            'oi.payment_status_promotion'
        )
    } else {
        query.groupBy('oi.id', 'o.id', 'u.id', 'pp.id')
        query.orderBy('oi.id', 'desc')
    }

    const result = await query
        .orderBy(options?.order_by || 'u.id')
        .paginate(options?.paginate)

    if (whereCondition.isQuantity) {
        result.data = await Promise.all(
            result.data.map(async (item) => {
                const options = await exports.getPromotionProductOption({
                    promotion_product_id: item.promotion_product_id,
                })
                let quantity_from = 0
                let quantity_to = 0
                let value = 0

                options.forEach((o) => {
                    if (
                        o.quantity_from <= Number(item.quantity) &&
                        o.quantity_to >= Number(item.quantity)
                    ) {
                        quantity_from = o.quantity_from
                        quantity_to = o.quantity_to
                        value = o.value
                    }
                })

                item.quantity_from = quantity_from
                item.quantity_to = quantity_to
                item.value = value

                if (Number(item.quantity) >= quantity_from) {
                    return item
                }
            })
        )

        result.data = result.data.filter((item) => item !== undefined)
    }

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
            page: options?.page,
            page_size: options?.page_size,
        },
        data: result.data,
    }
}

exports.getAllPromotionsProduct = async (product_id, variation_id) => {
    const query = await knex
        .select('p.*')
        .first()
        .from('promotion as p')
        .leftJoin('promotion_product as pp', 'pp.promotion_id', 'p.id')
        .where('pp.variation_id', variation_id)
        .andWhere('pp.product_id', product_id)
        .andWhere('p.is_approve', true)
        .andWhere('p.status_validate', 'active')
        .groupBy('p.id')

    return query
}

exports.getPromotionRulusByIdsAndPromotionId = (
    { ids, promotion_id },
    { trx } = {}
) =>
    getKnex('promotion_product', trx)
        .select('id')
        .whereIn('id', ids)
        .andWhere('promotion_id', promotion_id)

exports.getPromotionAndOrder = async (condition, { trx } = {}) => {
    const { successful_promotion, type, payment_status_promotion } = condition
    let query = await knex
        .select('oi.*')
        .from('promotion as p')
        .innerJoin('order_item as oi', 'p.id', 'oi.promotion_id')
        .innerJoin('order as o', 'oi.order_id', 'o.id')
        .where('oi.successful_promotion', successful_promotion)
        .where('p.type', type)
        .andWhere({
            'oi.payment_status_promotion': payment_status_promotion,
        })
        .andWhere({ 'o.odii_status': 5 })

    return query
}

exports.delete = (condition, { trx } = {}) =>
    getKnex('promotion_product', trx).where(condition).del()

exports.getPromotionProductOption = (condition) =>
    knex.from('promotion_product_option').where(condition).orderBy('id', 'asc')

exports.insertPromotionProductOption = (data, { trx } = {}) =>
    getKnex('promotion_product_option', trx).returning('id').insert(data)

exports.deleteOption = (condition, { trx } = {}) =>
    getKnex('promotion_product_option', trx).where(condition).del()

exports.increment = (condition, body, { trx } = {}) =>
    getKnex('promotion', trx).increment(body).where(condition)
