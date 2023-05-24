const Joi = require('joi')
const _ = require('lodash')
const moment = require('moment-timezone')
const { STATUS, DISCOUNT, BULL_JOBS, APPLY_FOR } = require('../constants')
const Discount = require('../models/discount')
const { workerUpdateQueue } = require('../connections/bull-queue')
const Product = require('../models/product')
const { ACC_TYPE } = require('../constants')
const { parseOption } = require('../utils/pagination')
const { knex } = require('../connections/pg-general')

exports.supplierGetDiscounts = async (request) => {
    const { user } = request
    const option = parseOption(request.query)

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            apply_for: Joi.string()
                .allow(...Object.values(APPLY_FOR))
                .only(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    option.partner_id = user.partner_id

    const data = await Discount.getDiscounts(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierPostDiscounts = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const { product_ids, timezone, ...value } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            from_time: Joi.string().required(),
            to_time: Joi.string().required(),
            timezone: Joi.string().default('Asia/Ho_Chi_Minh').optional(),
            type: Joi.string()
                .allow(...Object.values(DISCOUNT))
                .only()
                .required(),
            apply_for: Joi.string()
                .allow(...Object.values(APPLY_FOR))
                .only()
                .required(),
            amount: Joi.number().required(),
            minimum_order_price: Joi.number(),
            maximum_discount: Joi.number(),
            total: Joi.number(),
            product_ids: Joi.array().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    value.from_time = moment(value.from_time, 'YYYY-MM-DD HH:mm:ss')
        .tz(timezone)
        .startOf('day')
        .utc()
        .toISOString()
    if (!value.from_time) throw new Error('invalid__from_time')

    value.to_time = moment(value.from_time, 'YYYY-MM-DD HH:mm:ss')
        .tz(timezone)
        .endOf('day')
        .utc()
        .toISOString()
    if (!value.to_time) throw new Error('invalid__to_time')

    value.partner_id = user.partner_id

    value.status = STATUS.ACTIVE

    const [discountId] = await Discount.insertDiscount(value)

    // eslint-disable-next-line no-restricted-syntax
    for await (const product_id of product_ids) {
        // eslint-disable-next-line no-loop-func
        await knex.transaction(async (trx) => {
            await Discount.insertProductDiscount(
                {
                    product_id,
                    discount_id: discountId,
                },
                { trx }
            )
            // worker update to product database

            console.log('run update product discount by worker = ', product_id)

            workerUpdateQueue.add(BULL_JOBS.UPDATE_DISCOUNT, {
                id: product_id,
                value,
            })

            // const { product_discount_metadata } = await Product.getOneById(
            //     product_id
            // )

            // const data = product_discount_metadata

            // data.push(value)

            // await Product.updateById(
            //     product_id,
            //     {
            //         product_discount_metadata: JSON.stringify(data),
            //     },
            //     { trx }
            // )
        })
    }

    return {
        is_success: true,
    }
}

exports.supplierGetDetailDiscount = async (request) => {
    const { user } = request

    if (user.account_type !== ACC_TYPE.SUP)
        throw new Error('user_are_not_supplier')

    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Discount.getDiscountById(id)

    if (!data) {
        throw new Error('discount_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.supplierUpdateDetailDiscount = async (request) => {
    const { user } = request
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            status: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const data = await Discount.getDiscount({ id, partner_id: user.partner_id })

    if (!data) {
        throw new Error('discount_id_not_found')
    }

    await Discount.updateDiscountById(id, body)

    return {
        is_success: true,
    }
}

exports.adminGetDiscounts = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            partner_id: Joi.string(),
            apply_for: Joi.string()
                .allow(...Object.values(APPLY_FOR))
                .only(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await Discount.getDiscounts(option, query)

    return {
        is_success: true,
        ...data,
    }
}
