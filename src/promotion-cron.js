const fs = require('fs')

if (fs.existsSync('.env.local')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}
const { CronJob } = require('cron')
const { TIME_ZONE } = require('./constants/index')
const PromotionService = require('./services/promotion')

// every 1p
// eslint-disable-next-line no-new
new CronJob({
    cronTime: '00 */1 * * * *',

    onTick() {
        PromotionService.checkTimePromotion()
    },
    start: true,
    timeZone: TIME_ZONE.VN_TZ,
})

// eslint-disable-next-line no-new
new CronJob({
    cronTime: '00 00 00 * * *',

    onTick() {
        PromotionService.updateTotalPromotion()
    },
    start: true,
    timeZone: TIME_ZONE.VN_TZ,
})
