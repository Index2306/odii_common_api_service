const puppeteer = require('puppeteer')
const Store = require('../models/store')

const CommonUtil = require('../utils/common.util')

function checkURLImage(url) {
    return url.match(/\.(jpeg|jpg|gif|png)$/) != null
}

exports.getInfoStore = async (storeId) => Store.getOneById(storeId)

exports.crawlAndSaveStoreLogo = async (storeId) => {
    try {
        console.log('run crawAndSaveLogo', storeId)
        const store = await Store.getStore(storeId)
        console.log('store = ', store.name)
        const storeNameAccent = CommonUtil.nonAccentVietnamese(store.name)
            .replace(/ /g, '-')
            .replace(/_/g, '')
        console.log(`https://www.lazada.vn/shop/${storeNameAccent}`)

        const iPhone = puppeteer.devices['iPhone X']
        const browser = await puppeteer.launch({
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
        })
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
            await Store.updateStore(storeId, { logo: data })
        }
        console.log('src', data)
        await browser.close()
    } catch (e) {
        console.log('crawlAndSaveLogo err: ', e.message)
    }
}

// setTimeout(async () => {
//     exports.crawlAndSaveStoreLogo('5')
// }, 2000)
