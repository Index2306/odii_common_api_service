const Joi = require('joi')
const { isEmpty, sumBy } = require('lodash')
const moment = require('moment')
const { ACC_TYPE, REDIS_KEY } = require('../constants')
const { parseOption } = require('../utils/pagination')
const Supplier = require('../models/supplier')
const PromotionRepo = require('../models/promotion')
const PromotionService = require('../services/promotion')
const Product = require('../models/product')
const ProductVariation = require('../models/product-variation')
const { redisClient } = require('../connections/redis-cache')
const User = require('../models/user')
const Order = require('../models/order')
const TransactionService = require('../services/transaction.service')

const { useMyTrx } = require('../connections/pg-general')

exports.getListPromotion = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            status_validate: Joi.string(),
            supplier_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stringUnknown: false, allowUnknown: true }
        )
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)

    if (supplier) {
        option.supplier_id = supplier.id
        option.created_by = user.id
        option.isOwner = user.roles.includes('owner')
        option.tenant_id = user.tenant_id
    }

    const data = await PromotionRepo.getPromotions(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getListDisCount = async (request) => {
    const { user } = request

    const option = parseOption(request.query)

    const { id, ...query } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            keyword: Joi.string(),
            payment_status: Joi.string(),
            supplier_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query, ...request.params },
            { stringUnknown: false, allowUnknown: true }
        )

    const dataPrt = await PromotionRepo.getPromotion({ id })

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)

    if (supplier) {
        option.supplier_id = supplier.id
        option.created_by = user.id
        option.isOwner = user.roles.includes('owner')
    }

    query.isQuantity = !!(dataPrt?.type === 'quantity_by')

    const result = await PromotionRepo.getListDisCountPromotion(
        id,
        option,
        query
    )
    result.data = result?.data.map((item) => {
        const finalPrice = exports.disCountFormula(
            item.origin_supplier_price,
            item.value,
            1,
            !!(dataPrt?.type === 'quantity_by' || item.type === 'percent')
        )

        item.supplier_promition_amount = item.origin_supplier_price - finalPrice

        item.total_amount = item.supplier_promition_amount * item.quantity

        return item
    })

    return {
        is_success: true,
        ...result,
    }
}

exports.getDetailPromotion = async (request) => {
    const { user } = request

    const option = parseOption(request.query)
    if (!user.account_type === ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)

    if (!supplier) {
        throw new Error('Không tìm thấy thông tin nhà cung cấp')
    }

    option.supplier_id = supplier.id

    const result = await PromotionRepo.getPromotionById(id, option)

    return {
        is_success: true,
        data: result[0],
    }
}

exports.addPromotionProduct = async (request) => {
    const { user } = request
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) {
        throw new Error('Không tìm thấy thông tin nhà cung cấp')
    }

    const { id, products } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            products: Joi.array().items(
                Joi.object().keys({
                    type: Joi.string().optional(),
                    status: Joi.string().optional(),
                    product_id: Joi.number().optional(),
                    variation_id: Joi.number().optional(),
                    name_option: Joi.string(),
                    origin_supplier_price: Joi.number().optional(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const prtData = products.map((product) => {
        product.promotion_id = id

        return product
    })

    const [ids] = await PromotionRepo.insertPromotionProduct(prtData)

    if (!ids) throw new Error('NOT_FOUND')

    return {
        is_success: true,
        data: ids,
    }
}

exports.updatePromotionOption = async (request) => {
    const { user } = request
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) {
        throw new Error('Không tìm thấy thông tin nhà cung cấp')
    }

    const { ids, options } = await Joi.object()
        .keys({
            ids: Joi.array().items(),
            options: Joi.array().items(
                Joi.object().keys({
                    id: Joi.number().optional(),
                    quantity_from: Joi.number().optional(),
                    quantity_to: Joi.number().optional(),
                    value: Joi.number().optional(),
                    promotion_id: Joi.string().optional(),
                    promotion_product_id: Joi.string().optional(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    await useMyTrx(null, async (trx) => {
        if (!isEmpty(ids)) {
            ids.map(async (id) => {
                await PromotionRepo.deleteOption({ promotion_product_id: id })
            })
        }
        await PromotionRepo.upsertPromotionOption(options, { trx })
    })

    return {
        is_success: true,
    }
}

exports.addPromotion = async (request) => {
    const { user } = request

    const { ...values } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            from_time: Joi.string().required(),
            to_time: Joi.string().required(),
            key: Joi.string().required(),
            type: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) {
        throw new Error('Không tìm thấy thông tin nhà cung cấp')
    }

    const existedSrc = await PromotionRepo.getPromotion({
        is_deleted: false,
        supplier_id: supplier.id,
        name: values.name,
        tenant_id: user.tenant_id,
    })

    if (existedSrc) {
        throw new Error('Tên chương trình khuyến mại đã tồn tại')
    }

    const result = await PromotionRepo.insertPromotion({
        ...values,
        supplier_id: supplier.id,
        is_deleted: false,
        created_at: new Date(),
        created_by: user.id,
        name_creator: user.full_name,
        status_validate: 'awaiting',
        tenant_id: user.tenant_id,
    })

    redisClient.delObject(REDIS_KEY.PROMOTION)

    return {
        is_success: true,
        data: result,
    }
}

exports.updatePromotion = async (request) => {
    const { user } = request

    const { id, products, ...value } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            name: Joi.string().optional(),
            type: Joi.string().optional(),
            note: Joi.string().optional(),
            from_time: Joi.string().optional(),
            to_time: Joi.string().optional(),
            products: Joi.array().items(
                Joi.object().keys({
                    id: Joi.string().optional(),
                    type: Joi.string().optional(),
                    value: Joi.number().optional(),
                    status: Joi.string().optional(),
                    product_id: Joi.number().optional(),
                    variation_id: Joi.number().optional(),
                    name_option: Joi.string(),
                    origin_supplier_price: Joi.number().optional(),
                })
            ),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const result = await PromotionService.updatePromotion(user, {
        products,
        id,
        ...value,
    })

    if (!result) throw new Error('NOT_FOUND')

    redisClient.delObject(REDIS_KEY.PROMOTION)

    return {
        is_success: true,
        data: result,
    }
}

exports.updatePromotionPayment = async (request) => {
    const { user } = request

    const { id, arrPromotion } = await Joi.object()
        .keys({
            id: Joi.number().required(),
            arrPromotion: Joi.array(),
        })
        .validateAsync(
            { ...request.params, ...request.body },
            { stripUnknown: true }
        )

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const dataReturn = await arrPromotion.map(async (promotion) => {
        const { partner_id } = await User.getPartnerUser({
            user_id: promotion.user.id,
        })

        const orderItems = await Order.getAllOrderItems({
            promotion_id: id,
            product_variation_id: promotion.variation_id,
        })

        if (!partner_id) throw new Error('invalid_partner_id')
        if (!orderItems) throw new Error('invalid_orderItem')

        const trxData = await useMyTrx(null, async (trx) => {
            const { supplierTransaction, sellerTransaction } =
                await PromotionService.updatePrmotionPayment(
                    id,
                    user,
                    promotion,
                    partner_id,
                    orderItems,
                    user.tenant_id
                )

            if (!supplierTransaction || !sellerTransaction)
                throw new Error('Thanh toán không thành công!')

            await TransactionService.confirmedDebtPromotionTransaction(
                {
                    for_partner_id: user.partner_id, // supplier
                    amount: supplierTransaction.amount,
                    tenant_id: user.tenant_id,
                },
                trx
            )

            await TransactionService.confirmedDebtPromotionTransaction(
                {
                    for_partner_id: partner_id, // seller
                    amount: sellerTransaction.amount,
                    tenant_id: user.tenant_id,
                },
                trx
            )

            return { supplierTransaction, sellerTransaction }
        })

        if (!trxData) {
            return {
                is_success: false,
            }
        }

        return trxData
    })

    await Promise.all(dataReturn)

    if (!isEmpty(dataReturn)) {
        const dataPromotion = await PromotionRepo.getPromotion({ id })
        const totalAmount =
            sumBy(arrPromotion, 'total_amount') + dataPromotion.total_amount
        await PromotionRepo.updateById(id, {
            total_amount: totalAmount,
        })
    }

    return {
        is_success: true,
    }
}

exports.updateState = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.number().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')
    const supplierOfUser = await Supplier.getSupplierByPartnerId(
        user.partner_id
    )
    if (!supplierOfUser) throw new Error('invalid_supplier')

    const data = await PromotionRepo.getPromotionById(id)

    if (isEmpty(data[0].products))
        throw new Error(`Vui lòng chọn sản phẩm khuyến mại!`)

    if (data[0].type === 'product_by') {
        const objectData = data[0].products.find(
            (item) =>
                item.value === 0 || item.value === '' || isEmpty(item.type)
        )
        if (objectData)
            throw new Error(`Vui lòng nhập đầy đủ thông tin điều kiện!`)
    }

    const dataPrt = data[0].products.map(async (item) => {
        const promotionPrt = await PromotionRepo.getAllPromotionsProduct(
            item.product_id,
            item.variation_id
        )

        if (
            promotionPrt?.id !== data[0]?.id &&
            !isEmpty(promotionPrt) &&
            item.status === 'active' &&
            moment(promotionPrt?.to_time) > moment(data[0]?.from_time)
        ) {
            throw new Error(
                `Sản phẩm "${item.variation.productName}" đang được KM ở CT khác.`
            )
        }
    })

    await Promise.all(dataPrt)

    if (!data[0]) {
        throw new Error('promotion id not found')
    }

    await PromotionRepo.updateById(id, {
        is_approve: !data[0]?.is_approve,
        approved_time: new Date(),
        approved_by: user?.full_name,
    })
    if (data[0].status_validate?.includes('active')) {
        const updateProduct = data[0].products.map(async (item) => {
            if (item.status === 'active') {
                await Product.update(
                    { id: item?.product_id },
                    {
                        is_promotion: !data[0]?.is_approve,
                        promotion_id: id,
                    }
                )
                await ProductVariation.updateProductVariation(
                    { id: item?.variation_id },
                    {
                        is_promotion: !data[0]?.is_approve,
                        promotion_id: id,
                    }
                )
            }
        })

        await Promise.all(updateProduct)
    }

    redisClient.delObject(REDIS_KEY.PROMOTION)

    return {
        is_success: true,
    }
}

exports.deletePromotion = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await PromotionRepo.getPromotionById(id)

    if (!data) {
        throw new Error('promotion id not found')
    }

    data[0].products.map(async (item) => {
        await Product.updateById(item.product_id, {
            is_promotion: false,
        })
        await ProductVariation.updateProductVariationById(item.variation_id, {
            is_promotion: false,
        })
    })

    await PromotionRepo.updateById(id, {
        is_deleted: true,
        updated_at: new Date(),
        updated_by: user.id,
    })

    redisClient.delObject(REDIS_KEY.PROMOTION)

    return {
        is_success: true,
    }
}

exports.deletePromotionOption = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await PromotionRepo.getPromotionProductOption({ id })

    if (!data) {
        throw new Error('Option id not found')
    }

    await PromotionRepo.deleteOption({ id })

    return {
        is_success: true,
    }
}

exports.disCountFormula = (price, discount, quantity = 1, isCheckQuantity) => {
    let finalPrice = 0

    if (isCheckQuantity) {
        finalPrice = (price - (price * discount) / 100) * quantity
    } else {
        finalPrice = (price - discount) * quantity
    }

    return finalPrice
}
