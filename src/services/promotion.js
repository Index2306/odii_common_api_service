const moment = require('moment-timezone')
const BlueBird = require('bluebird')
const { isEmpty, sumBy } = require('lodash')
const { redisClient } = require('../connections/redis-cache')
const { useMyTrx, knex } = require('../connections/pg-general')
const PromotionRepo = require('../models/promotion')
const Order = require('../models/order')
const Notification = require('../models/notification')
const {
    REDIS_KEY,
    TRANSACTION_TYPE,
    TRANSACTION_ACTION,
    TIME_ZONE,
} = require('../constants')
const Product = require('../models/product')
const TransactionService = require('./transaction.service')
const ProductVariation = require('../models/product-variation')
const User = require('../models/user')

exports.checkTimePromotion = async () => {
    let promotions = await redisClient.getObject(REDIS_KEY.PROMOTION)
    if (!promotions) {
        console.log('checkTimePromotion')
        promotions = await PromotionRepo.getAllPromotions({
            is_deleted: false,
        })
        await redisClient.setObject(REDIS_KEY.PROMOTION, promotions)
    }

    let isCheckPromotion = false

    await BlueBird.map(
        promotions,
        async (promotion) => {
            try {
                const now = moment(new Date())
                const timeFrom = moment(promotion?.from_time)
                const timeTo = moment(promotion?.to_time)
                let nextState = 'awaiting' // chua den km
                if (now >= timeFrom && now <= timeTo) {
                    nextState = 'active' // dang km
                } else if (now > timeTo) {
                    nextState = 'expired' // qua han
                }

                const moment24HoursAgo = timeFrom
                    .tz(TIME_ZONE.VN_TZ)
                    .subtract(1440, 'minute')

                if (
                    moment24HoursAgo.toISOString().split('.')[0] ===
                    now.toISOString().split('.')[0]
                ) {
                    await knex.transaction(async (trx) => {
                        isCheckPromotion = true
                        const dataUser = await User.getAllUsers({
                            account_type: 'seller',
                            is_deleted: false,
                            status: 'active',
                            tenant_id: promotion.tenant_id,
                        })
                        const value = {
                            name: promotion?.name,
                            content: promotion?.note,
                            source: 'seller',
                            type: 'common',
                            tenant_id: promotion.tenant_id,
                            status: 'active',
                            is_common_message: false,
                        }

                        const [id] = await Notification.insertMessage(value, {
                            trx,
                        })
                        if (dataUser) {
                            // eslint-disable-next-line no-restricted-syntax
                            const allUser = dataUser.map(async (item) => {
                                await Notification.insertMessageVsUser(
                                    {
                                        user_id: item.id,
                                        message_id: id,
                                        read_status: 'unread',
                                    },
                                    { trx }
                                )
                            })
                            await Promise.all(allUser)
                        }
                    })
                }

                // neu khac trang thai hienj taij thi xu ly
                if (nextState !== promotion.status_validate) {
                    isCheckPromotion = true

                    // 1 Update trang thai promotion
                    const isPromotion =
                        nextState === 'active' && promotion.is_approve

                    const data = await PromotionRepo.getPromotionProducts({
                        promotion_id: promotion?.id,
                        is_deleted: false,
                    })
                    const updateProducts = data.map((item) =>
                        Product.updateById(item?.product_id, {
                            is_promotion: isPromotion,
                            promotion_id: isPromotion ? promotion?.id : null,
                        })
                    )
                    const updateVariation = data.map((item) =>
                        ProductVariation.updateProductVariationById(
                            item?.variation_id,
                            {
                                is_promotion: isPromotion,
                                promotion_id: promotion?.is_approve
                                    ? promotion?.id
                                    : null,
                            }
                        )
                    )
                    await PromotionRepo.updateById(promotion?.id, {
                        status_validate: nextState,
                    })
                    await Promise.all(updateProducts)
                    await Promise.all(updateVariation)
                }
            } catch (err) {
                console.error('checkPromotion id = ', promotion?.id)
                console.error(err)
            }
        },
        { concurrency: 5 }
    )

    if (isCheckPromotion) {
        await redisClient.delObject(REDIS_KEY.PROMOTION)
    }
}

exports.updateTotalPromotion = async () => {
    const dataOrder = await PromotionRepo.getPromotionAndOrder({
        successful_promotion: false,
        type: 'product_by',
        payment_status_promotion: 'confirmed',
    })

    const dataPromotion = await PromotionRepo.getAllPromotions({
        is_deleted: false,
        type: 'product_by',
    })

    await BlueBird.map(
        dataPromotion,
        async (promotion) => {
            const dataOrderItem = dataOrder.filter(
                (orderItem) => promotion.id === orderItem.promotion_id
            )

            if (!isEmpty(dataOrderItem)) {
                const amount =
                    sumBy(dataOrderItem, 'supplier_promition_amount') +
                    promotion?.total_amount

                await PromotionRepo.update(
                    { id: promotion.id },
                    {
                        total_amount: amount,
                    }
                )

                const allData = dataOrderItem.map(async (item) => {
                    await Order.updateOrderItem(
                        { id: item.id },
                        {
                            successful_promotion: true,
                        }
                    )
                })
                await Promise.all(allData)
            }
        },
        { concurrency: 5 }
    )
}

exports.updatePromotion = async (user, { products, id, ...value }) => {
    const result = await useMyTrx(null, async (trx) => {
        const productIds = products.filter((i) => !!i.id).map((i) => i.id)

        const productsInDB =
            await PromotionRepo.getPromotionRulusByIdsAndPromotionId({
                ids: productIds,
                promotion_id: id,
            })

        if (productIds.length !== productsInDB.length) {
            throw new Error('invalid_products_id')
        }

        const productsUpdateData = products.map((product) => {
            product.promotion_id = id

            if (product.id) product.id = product.id.toString()

            return product
        })

        await PromotionRepo.upsertPromotion(productsUpdateData, {
            trx,
        })

        await PromotionRepo.updateById(id, { ...value }, { trx })

        return id
    })

    return result
}

exports.updatePrmotionPayment = async (
    id,
    user,
    promotion,
    partner_id,
    orderItems,
    tenantId
) => {
    const trxData = await useMyTrx(null, async (trx) => {
        const [supplierTransaction, sellerTransaction] = await Promise.all([
            TransactionService.makeTransactionPromotion(
                {
                    promotion_id: id,
                    user,
                    for_partner_id: user.partner_id, // supplier
                    transaction_type: TRANSACTION_TYPE.WITHDRAWAL,
                    amount: promotion.total_amount,
                    source: 'supplier',
                    action_type: TRANSACTION_ACTION.PROMOTIONAL_GET_REFUND,
                    note: 'Thanh toán khuyến mại',
                    tenant_id: tenantId,
                },
                trx
            ),
            TransactionService.makeTransactionPromotion(
                {
                    promotion_id: id,
                    user: promotion.user,
                    for_partner_id: partner_id, // seller
                    transaction_type: TRANSACTION_TYPE.DEPOSIT,
                    amount: promotion.total_amount,
                    source: 'seller',
                    action_type: TRANSACTION_ACTION.PROMOTIONAL_GET_REFUND,
                    note: 'Hoàn tiền khuyến mại',
                    tenant_id: tenantId,
                },
                trx
            ),
            orderItems.forEach(async (orderItem) => {
                await Order.updateOrderItem(
                    { id: orderItem?.id },
                    {
                        payment_status_promotion: 'confirmed',
                        supplier_promition_amount:
                            promotion.supplier_promition_amount,
                    },
                    trx
                )
            }),
        ])

        return { supplierTransaction, sellerTransaction }
    })

    return trxData
}
