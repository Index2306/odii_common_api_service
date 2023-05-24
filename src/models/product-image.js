const _ = require('lodash')
const { knex, getKnex } = require('../connections/pg-general')

exports.insertProductImage = (data) =>
    knex('product_image').returning('id').insert(data)

exports.getOne = (condition) =>
    knex.first().from('product_image').where(condition)

exports.insertThumbToProductImage = async (product_id, thumb, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: thumb.location,
        width: thumb.metadata?.width,
        height: thumb.metadata?.height,
        name: thumb.name,
        source: thumb.source,
        product_id,
        is_thumb: true,
    }

    return getKnex('product_image').returning('id').insert(productImageBody)
}

exports.insertSizeChartToProductImage = async (product_id, sise_chart, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: sise_chart.location,
        width: sise_chart.metadata?.width,
        height: sise_chart.metadata?.height,
        name: sise_chart.name,
        source: sise_chart.source,
        product_id,
        position: 5,
    }

    return getKnex('product_image').returning('id').insert(productImageBody)
}

exports.updateThumbToProductImage = async (product_id, thumb, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: thumb.location,
        width: thumb.metadata?.width,
        height: thumb.metadata?.height,
        name: thumb.name,
        source: thumb.source,
        product_id,
        is_thumb: true,
    }

    const existThumb = await exports.getOne({ product_id, is_thumb: true })
    if (!existThumb) {
        const [id] = await getKnex('product_image')
            .returning('id')
            .insert(productImageBody)

        return id
    }

    await getKnex('product_image')
        .where({ id: existThumb.id })
        .update(productImageBody)

    return existThumb.id
}

exports.updateSizeChartToProductImage = async (product_id, sise_chart, user) => {
    const productImageBody = {
        partner_id: user.partner_id,
        location: sise_chart.location,
        width: sise_chart.metadata?.width,
        height: sise_chart.metadata?.height,
        name: sise_chart.name,
        source: sise_chart.source,
        product_id,
        position: 5,
    }

    const existThumb = await exports.getOne({ product_id, position: 5 })
    if (!existThumb) {
        const [id] = await getKnex('product_image')
            .returning('id')
            .insert(productImageBody)

        return id
    }

    await getKnex('product_image')
        .where({ id: existThumb.id })
        .update(productImageBody)

    return existThumb.id
}

exports.updateProductImageByIds = (ids, data, { trx } = {}) =>
    getKnex('product_image', trx).whereIn('id', ids).update(data)

exports.update = (condition, data, { trx } = {}) =>
    getKnex('product_image', trx).where(condition).update(data)

exports.getProductImagesByProductId = async (productId) => {
    const data = await knex
        .select('*')
        .from('product_image')
        .where({ is_deleted: false, product_id: productId })
        .orderBy('id', 'asc')

    return data
}

exports.getProductImagesByProductStockId = async (productStockId) => {
    const query = await knex
        .first()
        .from('product_stock')
        .where({ is_deleted: false, id: productStockId })

    const data = await knex
        .select('*')
        .from('product_image')
        .where({ is_deleted: false, product_id: query.product_id })
        .orderBy('id', 'asc')

    return data
}

exports.getProductImagesIncludeThumbByProductId = async (productId) => {
    const data = await knex
        .select('*')
        .from('product_image')
        .where({
            // is_deleted: false,
            product_id: productId,
        })
        .where((bd) => {
            bd.orWhere({ is_deleted: false }).orWhere({ is_thumb: true })
        })
        .orderBy('id', 'asc')

    return data
}

exports.getProductImagesIncludeThumbByProductStockId = async (productStockId) => {
    const query = await knex
        .first()
        .from('product_stock')
        .where({ is_deleted: false, id: productStockId })

    const data = await knex
        .select('*')
        .from('product_image')
        .where({
            // is_deleted: false,
            product_id: query.product_id,
        })
        .where((bd) => {
            bd.orWhere({ is_deleted: false }).orWhere({ is_thumb: true })
        })
        .orderBy('id', 'asc')

    return data
}

exports.insertProductImages = (data, { trx } = {}) =>
    getKnex('product_image', trx)
        .returning('id')
        .insert(data)
        .onConflict('id')
        .ignore()
