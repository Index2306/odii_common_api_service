const Joi = require('joi')
const Customer = require('../models/customer')
const { parseOption } = require('../utils/pagination')

exports.getCustomers = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    option.partner_id = user.partner_id
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await Customer.getCustomers(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createCustomer = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            email: Joi.string().email().required(),
            phone_number: Joi.string(),
            full_name: Joi.string(),
            avatar: Joi.string().optional(),
            birthday: Joi.date().optional(),
            address1: Joi.string(),
            address2: Joi.string(),
            country_id: Joi.number(),
            province_id: Joi.number(),
            district_id: Joi.number(),
            ward_id: Joi.number(),
            country_name: Joi.string(),
            province_name: Joi.string(),
            district_name: Joi.string(),
            ward_name: Joi.string(),
            type: Joi.string(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.partner_id = user.partner_id
    value.tenant_id = user.tenant_id
    // const customer = await Customer.getCustomer({
    //     phone_number: value.phone_number,
    // })
    // if (customer) throw new Error('phone_number_already_exits')
    const [id] = await Customer.insertCustomer(value)

    return {
        is_success: true,
        data: {
            id,
        },
    }
}

exports.updateCustomer = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            email: Joi.string().email().required(),
            phone_number: Joi.string(),
            full_name: Joi.string(),
            avatar: Joi.string().optional(),
            birthday: Joi.date().optional(),
            address1: Joi.string(),
            address2: Joi.string(),
            country_id: Joi.number(),
            province_id: Joi.number(),
            district_id: Joi.number(),
            ward_id: Joi.number(),
            country_name: Joi.string(),
            province_name: Joi.string(),
            district_name: Joi.string(),
            ward_name: Joi.string(),
            type: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const customer = await Customer.getCustomerById(id)

    if (!customer) {
        throw new Error('customer_id_not_found')
    }
    // const exitPhone = await Customer.getCustomerNotItself(
    //     {
    //         phone_number: body.phone_number,
    //     },
    //     id
    // )
    // if (exitPhone) throw new Error('phone_number_already_exits')

    await Customer.updateCustomerById(id, body)

    return {
        is_success: true,
    }
}
exports.getCustomerDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Customer.getCustomerById(id)

    if (!data) {
        throw new Error('customer_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}
