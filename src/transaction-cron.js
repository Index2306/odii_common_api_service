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
const BlueBird = require('bluebird')
const TransactionService = require('./services/transaction.service')
const UserService = require('./services/user')
const { TIME_ZONE } = require('./constants/index')
const Store = require('./models/store')
const LazadaInternalSvc = require('./services/lazada.service')
// const ProductCategory = require('./models/product-category')

console.log('TRANSACTION CRON RUNNING')

// every 30p
new CronJob({
    // cronTime: '00 */1 * * * *',
    cronTime: '00 */30 * * * *',

    onTick() {
        TransactionService.checkTransactionStt()
        UserService.deleteUserInactive()
    },
    start: true,
    timeZone: TIME_ZONE.VN_TZ,
})

// --max-old-space-size=8192

/*
result =  {
  name: 'Just sell it',
  verified: true,
  location: 'Hà Nội',
  seller_id: 200168973140,
  email: 'odii.tester@gmail.com',
  short_code: 'VN33W6E3DA',
  cb: false,
  status: 'ACTIVE'
}

{
  is_success: false,
  error_code: 'LAZADA_ERROR_CODE_IllegalAccessToken',
  error_message: 'The specified access token is invalid or expired'
}

*/

const checkLazadaStore = async()=>{
    const allStore = await Store.getMany({is_deleted: false, platform: 'lazada'})
    console.log('allStore = ', allStore)
    console.log('len =', allStore.length)
    await BlueBird.map(allStore, async (store)=>{
        const lzdStoreInfo = await LazadaInternalSvc.lzdGetStore({"store_id": store.id.toString()})
        if(lzdStoreInfo.is_success === false) {
            console.log('set inactive id = ', store.id)
            await Store.updateStore(store.id, {status: 'inactive'})
        }
    })

}

new CronJob({
    cronTime: '00 00 00 * * *',

    onTick() {
        checkLazadaStore()
    },
    start: true,
    timeZone: TIME_ZONE.VN_TZ,
})
