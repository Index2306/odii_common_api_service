const Joi = require('joi')
const Location = require('../models/location')
const { parseOption } = require('../utils/pagination')

exports.getLocations = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const data = await Location.getLocations(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createLocation = async (request) => {
    const { user } = request
    const value = await Joi.object()
        .keys({
            store_id: Joi.string(),
            address1: Joi.string(),
            address2: Joi.string(),
            province: Joi.string().required(),
            province_code: Joi.string(),
            country: Joi.string().required(),
            country_code: Joi.string(),
            district_id: Joi.number(),
            district_name: Joi.string(),
            city: Joi.string(),
            zip: Joi.string(),
            phone: Joi.string(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.partner_id = user.partner_id

    const data = await Location.insertLocation(value)
    const success = data[0] !== 0

    return {
        is_success: success,
    }
}

exports.updateLocation = async (request) => {
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            address1: Joi.string(),
            address2: Joi.string(),
            province: Joi.string(),
            province_code: Joi.string(),
            country: Joi.string(),
            country_code: Joi.string(),
            district_id: Joi.string(),
            district_name: Joi.string(),
            city: Joi.string(),
            zip: Joi.string().allow(''),
            phone: Joi.string(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )
    const location = await Location.getLocationById(id)

    if (!location) throw new Error('location_id_not_found')

    await Location.updateLocationById(id, body)

    return {
        is_success: true,
    }
}
exports.getLocationDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Location.getLocationById(id)

    if (!data) {
        throw new Error('location_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.getLocationCountry = async (request) => {
    const { type, parent_id, keyword } = await Joi.object()
        .keys({
            parent_id: Joi.string(),
            type: Joi.string()
                .allow('province', 'ward', 'country', 'district')
                .only()
                .default('country'),
            keyword: Joi.string().default(''),
        })
        .validateAsync(request.query, { stripUnknown: true })

    let data
    switch (type) {
        case 'province':
            data = await Location.getProvinces(keyword, parent_id || 240)
            break
        case 'district':
            if (!parent_id) throw new Error('parent_not_found')
            data = await Location.getDistrictByCityID(keyword, parent_id)
            break
        case 'ward':
            if (!parent_id) throw new Error('parent_not_found')
            data = await Location.getWardByDistrictID(keyword, parent_id)
            break
        default:
            data = await Location.getCountries(keyword)
    }

    return { is_success: true, ...data }
}
