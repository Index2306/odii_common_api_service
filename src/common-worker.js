const fs = require('fs')

if (fs.existsSync('.env.local')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}
const { Worker } = require('bullmq')
const puppeteer = require('puppeteer')
const { redisConnection } = require('./connections/bull-ioredis')

const { BULL_QUEUES, BULL_JOBS } = require('./constants')
const Store = require('./models/store')

const CommonUtil = require('./utils/common.util')

console.log('worker crawl data')

function checkURLImage(url) {
    return url.match(/\.(jpeg|jpg|gif|png)$/) != null
}

async function crawlAndSaveLogo(store_id) {
    try {
        console.log('run crawAndSaveLogo', store_id)
        const store = await Store.getStore(store_id)
        console.log('store = ', store.name)
        const storeNameAccent = CommonUtil.nonAccentVietnamese(
            store.name
        ).replace(/ /g, '-')
        console.log(`https://www.lazada.vn/shop/${storeNameAccent}`)

        const iPhone = puppeteer.devices['iPhone X']
        const browser = await puppeteer.launch()
        const page = await browser.newPage()
        await page.emulate(iPhone)

        await page.goto(`https://www.lazada.vn/shop/${storeNameAccent}`, {
            waitUntil: 'load',
            timeout: 0,
        })

        const data = await page.evaluate(
            `(async() => {
            const result = document.querySelectorAll('.mod-cross-image')[0]
            if(!result) return

            return result.src
        })()`
        )
        if (data && checkURLImage(data)) {
            await Store.updateStore(store_id, { logo: data })
        }
        console.log('src', data)
        await browser.close()
    } catch (e) {
        console.log('crawlAndSaveLogo err: ', e.message)
    }
}

// async function crawlTransaction(bank_id) {
//     try {
//         console.log('run crawlTransaction', bank_id)
//         console.log(
//             `https://online.mbbank.com.vn/information-account/source-account`
//         )

//         const iPhone = puppeteer.devices['iPhone X']
//         const browser = await puppeteer.launch()
//         const page = await browser.newPage()
//         await page.emulate(iPhone)

//         await page.goto(
//             `https://online.mbbank.com.vn/information-account/source-account`,
//             {
//                 waitUntil: 'load',
//                 timeout: 0,
//             }
//         )
//         const result = []
//         await page.evaluate(
//             `(async() => {
//                  document.getElementsByTagName('table')[0].rows.map((item) => {
//                      result.push(item)
//                  })

//             })()`
//         )
//         console.log('src', result)
//         await browser.close()
//     } catch (e) {
//         console.log('crawlAndSaveLogo err: ', e.message)
//     }
// }

// setTimeout(() => {
//     crawlTransaction('48')
// }, 3000)

// const worker = new Worker(
//     BULL_QUEUES.WORKER_CRAWL,
//     async (job) => {
//         if (job.name === BULL_JOBS.INSERT_LOGO) {
//             console.log(1, job.data)
//             await crawlAndSaveLogo(job.data.store_id)
//         }
//         // if (job.name === BULL_JOBS.GET_TRANSACTION) {
//         //     console.log(1, job.data)
//         //     //await crawlAndSaveLogo(job.data.store_id)
//         // }
//     },
//     { connection: redisConnection }
// )

// worker.on('completed', (job) => {
//     console.log(`${job.id} has completed!`)
// })

// worker.on('failed', (job, err) => {
//     console.log(`${job.id} has failed with ${err.message}`)
// })
