const fs = require('fs')

if (fs.existsSync('.env.local')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}
const { Worker } = require('bullmq')
const { redisConnection } = require('./connections/bull-ioredis')

const { BULL_QUEUES, BULL_JOBS, ES_INDEX } = require('./constants')
const { esClient } = require('./connections/elasticsearch')
const Product = require('./models/product')
const ProductCate = require('./models/product-category')

console.log('PRODUCT_WORKER')

async function buildSource(productId) {
    const productData = await Product.getProductDetail(productId)
    // lamf giau product data

    return productData
}

const getProductCate = async (productCateId) => {
    const productCateData = await ProductCate.getCategoryById(productCateId)

    return productCateData
}

async function buildESDoc(data, index) {
    const putDataResult = await esClient.index({
        index,
        id: data.id,
        body: data,
    })

    return putDataResult
}

async function updateProductDiscount(
    product_discount_metadata,
    product_id,
    value
) {
    const data = product_discount_metadata

    data.push(value)

    await Product.updateById(product_id, {
        product_discount_metadata: JSON.stringify(data),
    })
}

// const worker = new Worker(
//     BULL_QUEUES.WORKER_UPDATE,
//     async (job) => {
//         if (job.name === BULL_JOBS.UPDATE_PRODUCT) {
//             const productSourceData = await buildSource(job.data?.id)
//             if (!productSourceData) throw new Error('product_not_found')
//             await buildESDoc(productSourceData, ES_INDEX.PRODUCT)
//         }
//         if (job.name === BULL_JOBS.UPDATE_PRODUCT_CATE) {
//             console.log(1)
//             const productCateData = await getProductCate(job.data?.id)
//             if (!productCateData) throw new Error('product_cate_not_found')
//             await buildESDoc(productCateData, ES_INDEX.DEV_PRODUCT_CATEGORY)
//         }
//     },
//     { connection: redisConnection }
// )

const worker = new Worker(
    BULL_QUEUES.WORKER_UPDATE,
    async (job) => {
        if (job.name === BULL_JOBS.UPDATE_DISCOUNT) {
            const productSourceData = await buildSource(job.data?.id)
            if (!productSourceData) throw new Error('product_not_found')
            await updateProductDiscount(
                productSourceData.product_discount_metadata,
                job.data?.id,
                job.data?.value
            )
        }
    },
    { connection: redisConnection }
)

worker.on('completed', (job) => {
    console.log(`${job.id} has completed!`)
})

worker.on('failed', (job, err) => {
    console.log(`${job.id} has failed with ${err.message}`)
})
