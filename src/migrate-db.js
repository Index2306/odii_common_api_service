/* eslint-disable consistent-return */
/* eslint-disable no-return-assign */
/* eslint-disable no-restricted-syntax */
const fs = require('fs')

if (fs.existsSync('.env.local')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env.local' })
} else if (fs.existsSync('.env')) {
    // eslint-disable-next-line global-require
    require('dotenv-safe').config({ path: '.env' })
}

const _ = require('lodash')
const BlueBird = require('bluebird')

const Attribute = require('./models/store-category-attribute')
const Category = require('./models/product-category')
const PlatformCategoryList = require('./models/platform-category-list')
const CommonUtil = require('./utils/common.util')
const { arrCatAttributesLabel } = require('./utils/app-data')
const {
    genDebtPeriod,
    getDebtPerioldByTime,
    updateByKey,
} = require('./models/debt-period')
const {
    getTransactionHaveDebt,
    updateTransaction,
} = require('./models/transaction')
const { getMany, update } = require('./models/partner-debt')

async function doit(offset = 0) {
    console.log(' run doit offset = ', offset)
    const mapLabel = new Map()
    for (const item of arrCatAttributesLabel) {
        const newViLabel = _.upperFirst(
            item.label_vi.replace(/_/g, ' ').toLowerCase()
        )
        mapLabel.set(item.label_en, newViLabel)
    }

    const SIZE = 8
    const allAtt = await Attribute.getMany(SIZE, offset * SIZE)
    console.log('allAtt len = ', allAtt.length)
    if (_.isEmpty(allAtt)) return

    await BlueBird.map(allAtt, async (attrData) => {
        console.log('attrData id = ', attrData.id)
        try {
            if (_.isEmpty(attrData.attributes)) return
            for (const attr of attrData.attributes) {
                attr.label_vi = mapLabel.get(attr.label) || attr.label
            }
            const { id, attributes } = attrData
            await Attribute.updateById(id, {
                attributes: JSON.stringify(attributes),
            })
        } catch (error) {
            console.log('ERROR attrData id = ', attrData.id)
        }
    })
    const newOffset = offset + 1
    console.log('newOffset = ', newOffset)
    doit(newOffset)
}

// setTimeout(doit, 200)

function getCatPath(map, child, result = {}) {
    const obj = map.get(child.id.toString())
    let newResult = {
        search_txt: _.compact([obj.search_txt, result.search_txt]).join(' / '),
        cat_path: _.compact([obj.name, result.cat_path]).join(' / '),
    }
    if (!obj.parent_id) return newResult
    const parent = map.get(obj.parent_id.toString())
    if (parent.parent_id) {
        newResult = getCatPath(map, parent, newResult)
    } else {
        newResult = {
            search_txt: _.compact([
                parent.search_txt,
                newResult.search_txt,
            ]).join(' / '),
            cat_path: _.compact([parent.name, newResult.cat_path]).join(' / '),
        }
    }

    return newResult
}

async function migrateSearchTextCategory() {
    console.log('run migrateSearchTextCategory')

    const allCat = await Category.getMany(10000, 0)
    console.log('Category len = ', allCat.length)
    if (_.isEmpty(allCat)) return

    const mapCat = new Map()
    for (const item of allCat) {
        const newViLabel = _.deburr(CommonUtil.nonAccentVietnamese(item.name))
        mapCat.set(item.id, { ...item, search_txt: newViLabel })
    }
    await BlueBird.map(
        allCat,
        async (catItem) => {
            try {
                // console.log('catItem = ', catItem)
                const updateBody = getCatPath(mapCat, catItem)
                console.log(
                    `catid = ${catItem.id} - updateBody result =`,
                    updateBody
                )
                await Category.updateCategoryById(catItem.id, updateBody)
            } catch (error) {
                console.log('error = ', error)
                console.log('ERRROR WITH ID = ', catItem.id)
            }
        },
        { concurrency: 5 }
    )

    console.log('DONE')
}

function getStoreCatPath(map, child, result = {}) {
    const obj = map.get(child.id.toString())
    let newResult = {
        search_txt: _.compact([obj.search_txt, result.search_txt]).join(' / '),
        display_path: _.compact([obj.name, result.display_path]).join(' / '),
    }
    if (!obj.parent_id) return newResult
    const parent = map.get(obj.parent_id.toString())
    if (parent.parent_id) {
        newResult = getCatPath(map, parent, newResult)
    } else {
        newResult = {
            search_txt: _.compact([
                parent.search_txt,
                newResult.search_txt,
            ]).join(' / '),
            display_path: _.compact([parent.name, newResult.display_path]).join(
                ' / '
            ),
        }
    }

    return newResult
}

function findParentCat(mapCat, childCat, result) {
    if (!childCat.parent_id) return result
    const parentCat = mapCat.get(childCat.parent_id.toString())
    if (!parentCat) return result
    result.unshift(parentCat)
    if (!parentCat.parent_id) return result

    return findParentCat(mapCat, parentCat, result)
}

async function migratePathStoreCat() {
    console.log('run migratePathStoreCat')

    const allCat = await PlatformCategoryList.getMany({ platform: 'shopee' })
    console.log('Category len = ', allCat.length)
    if (_.isEmpty(allCat)) return

    const mapCat = new Map()
    for (const item of allCat) {
        mapCat.set(item.shop_cat_id.toString(), item)
    }

    //   100001/100019/100136/100452
    // Health / Personal Care / Feminine Care / Vaginal Cream

    await BlueBird.map(
        allCat,
        async (catItem) => {
            try {
                const catPathResult = findParentCat(mapCat, catItem, [catItem])
                const display_path = catPathResult
                    .map((item) => item.display_name)
                    .join(' / ')

                const search_txt = _.deburr(
                    CommonUtil.nonAccentVietnamese(display_path)
                )
                const ids_path = catPathResult.map((item) => item.shop_cat_id)

                const updateBody = {
                    display_path,
                    search_txt,
                    ids_path: JSON.stringify(ids_path),
                }

                // await PlatformCategoryList.update(
                //     { id: catItem.id },
                //     updateBody
                // )
                console.log('display_path = ', display_path)
            } catch (error) {
                console.log('error = ', error)
                console.log('ERRROR WITH ID = ', catItem.id)
            }
        },
        { concurrency: 5 }
    )

    console.log('DONE')
}

async function initDebtPeriod() {
    console.log('init debt period')
    genDebtPeriod()
}
async function migrateTransaction() {
    const allTrans = await getTransactionHaveDebt()
    console.log('allTrans', allTrans.length)
    for (const trans of allTrans) {
        // Get debt key of trans
        const period = await getDebtPerioldByTime(trans.confirmed_at)
        console.log(
            `found period, confirmed_at=${trans.confirmed_at} trans.debt_period_key=${trans.debt_period_key} period_key=${period?.key}`
        )
        // check if trans key already saved, ignore
        if (period && period.key !== trans.debt_period_key) {
            // update period
            const updateData = {}
            updateData.debt_amount =
                period.debt_amount * 1 + trans.amount * 1 - trans.fee * 1
            if (trans.order_id) {
                updateData.number_of_order = period.number_of_order * 1 + 1
            }
            if (trans.status === 'succeeded') {
                updateData.payout_amount =
                    period.payout_amount * 1 + trans.amount * 1 - trans.fee * 1
            }
            console.log('updateData', updateData)
            await updateByKey(period.key, updateData)
            await updateTransaction(
                { id: trans.id },
                { debt_period_key: period.key }
            )
        }
    }
}

async function migratePartnerDebt() {
    const allPartnerDebt = await getMany({})
    console.log('allPartnerDebt', allPartnerDebt.length)
    for (const debt of allPartnerDebt) {
        const period = await getDebtPerioldByTime(debt.created_at)
        if (period && period.key !== debt.debt_period_key) {
            await update({ id: debt.id }, { debt_period_key: period.key })
        }
    }
}
// setTimeout(initDebtPeriod, 200)
// setTimeout(migrateTransaction, 200)
 setTimeout(migratePartnerDebt, 200)

// setTimeout(migrateSearchTextCategory, 200)

// setTimeout(() => {
//     console.log('test function')
//     merge()
// }, 5000)

// async function genId() {
//     const flakeIdGen = new FlakeId()

//     // const abc = await flakeIdGen()

//     console.info(flakeIdGen.id)
// }

// setTimeout(genId, 200)
