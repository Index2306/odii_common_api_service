/* eslint-disable no-new */
/* eslint-disable prettier/prettier */
/* eslint-disable no-await-in-loop */
const fs = require('fs')

if (fs.existsSync('.env.local')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}
const { CronJob } = require('cron')
const _ = require('lodash')
const UserService = require('./services/user')
const { TIME_ZONE } = require('./constants/index')
// const ProductCategory = require('./models/product-category')

console.log('USER CRON RUNNING')

// every day
new CronJob({
    // cronTime: '00 */1 * * * *',
    cronTime: '0 1 * * *',

    onTick() {
        UserService.notifyChangePassword()
    },
    start: true,
    timeZone: TIME_ZONE.VN_TZ,
})

// --max-old-space-size=8192
