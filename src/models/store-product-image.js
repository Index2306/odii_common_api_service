const { knex, getKnex } = require('../connections/pg-general')

exports.insert = (data) =>
    knex('store_product_image').returning('id').insert(data)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('store_product_image', trx).where(condition).update(data)

exports.updateManyByIds = (ids, data, { trx } = {}) =>
    getKnex('store_product_image', trx).whereIn('id', ids).update(data)

exports.delete = (condition, { trx } = {}) =>
    getKnex('store_product_image', trx).where(condition).del()

exports.getOne = (condition) =>
    knex.select().from('store_product_image').first().where(condition)

exports.getOneById = (id) => exports.getOne({ id })

exports.getManyByProductId = async (productId) => {
    const data = await knex
        .select('*')
        .from('store_product_image')
        .where({
            is_deleted: false,
            store_product_id: productId,
        })
        .orderBy('id', 'asc')

    return data
}

exports.insertMany = (data, { trx } = {}) =>
    getKnex('store_product_image', trx)
        .returning('id')
        .insert(data)
        .onConflict('id')
        .ignore()

exports.insertThumbToProductImage = async (store_product_id, thumb, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: thumb.location,
        width: thumb.metadata?.width,
        height: thumb.metadata?.height,
        name: thumb.name,
        source: thumb.source,
        store_product_id,
        is_thumb: true,
    }

    return getKnex('store_product_image')
        .returning('id')
        .insert(productImageBody)
}

exports.updateThumbToProductImage = async (store_product_id, thumb, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: thumb.location,
        width: thumb.metadata?.width,
        height: thumb.metadata?.height,
        name: thumb.name,
        source: thumb.source,
        store_product_id,
        is_thumb: true,
    }

    const existThumb = await exports.getOne({
        store_product_id,
        is_thumb: true,
    })
    if (!existThumb) {
        const [id] = await getKnex('store_product_image')
            .returning('id')
            .insert(productImageBody)

        return id
    }

    await getKnex('store_product_image')
        .where({ id: existThumb.id })
        .update(productImageBody)

    return existThumb.id
}
