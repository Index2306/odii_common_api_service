import { BULL_JOBS } from '../constants'

const _ = require('lodash')
const { workerUpdateQueue } = require('../connections/bull-queue')

const ProductCate = require('../models/product-category')
const PlatformCate = require('../models/platform-category-list')
const { esClient } = require('../connections/elasticsearch')

exports.updateProductToWorker = async (product_ids) => {
    // eslint-disable-next-line no-restricted-syntax
    for (const productId of product_ids) {
        console.log('run importProductIdToEs product = ', productId)
        workerUpdateQueue.add(BULL_JOBS.UPDATE_PRODUCT, { id: productId })
    }
}

exports.updateLogoToWorker = async (url, store_id) => {
    console.log(url)
    console.log(BULL_JOBS.UPDATE_LOGO)
    workerUpdateQueue.add(BULL_JOBS.UPDATE_LOGO, { url, store_id })
}

const insertProductCateEs = async (offset = 0, indexES, type) => {
    if (type === 'product') {
        const SIZE = 100
        const productCategories = await ProductCate.getMany(SIZE, offset * SIZE)
        if (_.isEmpty(productCategories)) return
        // eslint-disable-next-line no-restricted-syntax
        for await (const productCate of productCategories) {
            productCate.suggest_by_pName = productCate.cat_path
            esClient.index({
                index: indexES,
                id: productCate.id,
                body: productCate,
            })
        }
        const newOffset = offset + 1
        insertProductCateEs(newOffset, indexES, 'product')
    }
    if (type === 'platform') {
        const SIZE = 100
        const platformCategories = await PlatformCate.getMany(
            SIZE,
            offset * SIZE
        )
        if (_.isEmpty(platformCategories)) return
        // eslint-disable-next-line no-restricted-syntax
        for await (const platformCate of platformCategories) {
            platformCate.suggest_by_pName = platformCate.display_path
            esClient.index({
                index: indexES,
                id: platformCate.id,
                body: platformCate,
            })
        }
        const newOffset = offset + 1
        insertProductCateEs(newOffset, indexES, 'platform')
    }
}

exports.updateProductCateToWorker = async (indexES) => {
    await insertProductCateEs(0, indexES, 'product')
}

exports.updatePlatformCateToWorker = async (indexES) => {
    await insertProductCateEs(0, indexES, 'platform')
}
