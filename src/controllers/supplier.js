const Joi = require('joi')
const Supplier = require('../models/supplier')
const User = require('../models/user')
const Location = require('../models/location')
const Tenant = require('../models/tenant')
const SupplierWareHousing = require('../models/supplierWareHousing')
const { parseOption } = require('../utils/pagination')
const { knex } = require('../connections/pg-general')
const { SUP_STATUS, ACC_TYPE, STATUS } = require('../constants')

exports.getSuppliers = async (request) => {
    const { user } = request
    const option = parseOption(request.query)

    const { register_status, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            category_id: Joi.string(),
            province_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    if (register_status === 'active_all') {
        query.status_in = ['active']
    } else if (register_status === 'inactive_all') {
        query.status_in = ['inactive']
    } else {
        query.register_status = register_status
    }

    option.tenant_id = user.tenant_id

    const data = await Supplier.getSuppliers(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.createSupplier = async (request) => {
    const { user } = request

    const value = await Joi.object()
        .keys({
            name: Joi.string().required(),
            description: Joi.string().required(),
            location_id: Joi.number().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    value.partner_id = user.partner_id
    const data = await Supplier.insertSupplier(value)

    return {
        is_success: true,
        data: {
            id: data[0],
        },
    }
}

exports.updateSupplier = async (request) => {
    const { user } = request
    const { id, ...body } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string(),
            description: Joi.string(),
            status: Joi.string(),
            logo: Joi.object().allow(null),
            metadata: Joi.object().allow(null),
            thumb: Joi.object().allow(null),
            phone: Joi.string(),
            contact_email: Joi.string(),
            is_deleted: Joi.boolean(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            { stripUnknown: true }
        )

    const isExistSupplier = await Supplier.getSupplierById(id)

    if (!isExistSupplier) {
        throw new Error('supplier_id_not_found')
    }

    const supplier = await Supplier.getSupplierById(id)

    const dataUser = await User.getPartnerUsers({
        partner_id: supplier.partner_id,
    })

    const userIds = dataUser.map(item => item.user_id)

    const dataHouse = await SupplierWareHousing.getAllSupplierWareHousing({
        tenant_id: user.tenant_id,
        supplier_id: id,
    })

    const is_success = await knex.transaction(async (trx) => {
        if (body.status === STATUS.ACTIVE) {
            const dataSup = await User.getAllUsers({
                account_type: ACC_TYPE.SUP,
                is_deleted: false,
                status: 'active',
                tenant_id: user.tenant_id,
            })

            const dataStock = await SupplierWareHousing.getAllSupplierWareHousing({
                tenant_id: user.tenant_id,
                status: 'active',
            })

            const subscript = await Tenant.getSubscription({
                tenant_id: user.tenant_id,
                status: 'active'
            })

            if (!subscript) {
                throw new Error('subscription_has_expired')
            }

            if ((dataSup.length + userIds.length) > subscript.rule.maxSupplier) {
                throw new Error('Số tài khoản supplier hoạt động đã đạt mức tối đa cho phép của gói, Xin liên hệ với Odii để nâng hạn mức số Supplier')
            }

            if ((dataStock.length + dataHouse.lenght) > subscript.rule.maxStock) {
                throw new Error('Số kho hoạt động đã đạt mức tối đa cho phép của gói. Xin liên hệ với Odii để nâng hạn mức số kho')
            }

            await SupplierWareHousing.updateSupplierWareHousing(
                { tenant_id: user.tenant_id, supplier_id: id },
                {
                    status: STATUS.ACTIVE,
                },
                { trx }
            )

            for (const userId of userIds) {
                await User.updateUserById(
                    userId,
                    {
                        status: STATUS.ACTIVE,
                    },
                    { trx }
                )
            }

        } else if (body.status === STATUS.INACTIVE) {
            await SupplierWareHousing.updateSupplierWareHousing(
                { tenant_id: user.tenant_id, supplier_id: id },
                {
                    status: STATUS.INACTIVE,
                },
                { trx }
            )

            for (const userId of userIds) {
                await User.updateUserById(
                    userId,
                    {
                        status: STATUS.INACTIVE,
                    },
                    { trx }
                )
            }
        }
        await Supplier.updateSupplierById(id, body, { trx })

        return true
    })

    return {
        is_success,
    }
}
exports.getSupplierDetail = async (request) => {
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync({ ...request.params }, { stripUnknown: true })

    const data = await Supplier.getSupplierById(id)

    if (!data) {
        throw new Error('supplier_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.createSupplierFromUser = async (request) => {
    const { user } = request

    const { ware_housing, ...supplier } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            description: Joi.string().allow(null),
            thumb: Joi.object().allow(null),
            logo: Joi.object().allow(null),
            images: Joi.array().items(Joi.string()).allow(null),
            contact: Joi.object().allow(null),
            phone_number: Joi.string().required(),
            contact_email: Joi.string().required(),
            category_ids: Joi.array().items(Joi.string()),
            address: Joi.object({
                address1: Joi.string().required(),
                address2: Joi.string(),
                province: Joi.string().required(),
                province_code: Joi.string(),
                province_id: Joi.string(),
                country: Joi.string().required(),
                country_code: Joi.string(),
                district_id: Joi.number(),
                district_name: Joi.string(),
                ward_id: Joi.number(),
                ward_name: Joi.string(),
                city: Joi.string(),
            }),
            ware_housing: Joi.object({
                name: Joi.string(),
                description: Joi.string().allow(''),
                thumb: Joi.object().allow(null),
                phone: Joi.string().allow(''),
                is_pickup_address: Joi.boolean(),
                is_return_address: Joi.boolean(),
                location_data: Joi.object({
                    address1: Joi.string(),
                    address2: Joi.string(),
                    province: Joi.string(),
                    province_code: Joi.string(),
                    province_id: Joi.string(),
                    country: Joi.string(),
                    country_code: Joi.string(),
                    district_id: Joi.number(),
                    district_name: Joi.string(),
                    ward_id: Joi.number(),
                    ward_name: Joi.string(),
                    city: Joi.string(),
                }),
            }).allow(null),
            metadata: Joi.object({
                user_info: Joi.object({
                    representative_name: Joi.string().required(),
                    identity_card: Joi.string().required(),
                    images_representative_before: Joi.object()
                        .allow(null)
                        .required(),
                    images_representative_after: Joi.object()
                        .allow(null)
                        .required(),
                }),
                business_info: Joi.object({
                    category_license: Joi.string(),
                    images_license: Joi.array().allow(null).required(),
                }),
                billing_info: Joi.object({
                    sub_title: Joi.string().required(),
                    account_name: Joi.string().required(),
                    account_number: Joi.string().required(),
                    exp_date: Joi.string().allow(null),
                    bank_info_id: Joi.string().required(),
                }),
            }),
        })
        .validateAsync(request.body, { stripUnknown: true })

    const partner_id = await Supplier.getSupplierByPartnerId(user.partner_id)

    if (partner_id) throw new Error('supplier_already_has_this_partner_id')

    // eslint-disable-next-line camelcase
    const supId = await knex.transaction(async (trx) => {
        const [supplierId] = await Supplier.insertSupplier(
            {
                ...supplier,
                partner_id: user.partner_id,
                register_status: 'pending_for_review',
                user_id: user.id,
                images: JSON.stringify(supplier.images),
                category_ids: JSON.stringify(supplier.category_ids),
                tenant_id: user.tenant_id,
            },
            { trx }
        )
        if (ware_housing) {
            const [locationWareHousingId] = await Location.insertLocation(
                { ...ware_housing.location_data, partner_id: user.partner_id },
                { trx }
            )
            delete ware_housing.location_data
            await SupplierWareHousing.insertSupplierWareHousing(
                {
                    ...ware_housing,
                    status: 'inactive',
                    partner_id: user.partner_id,
                    supplier_id: supplierId,
                    location_id: locationWareHousingId,
                    tenant_id: user.tenant_id,
                },
                { trx }
            )
        }

        await User.updateUserById(
            user.id,
            { supplier_status: SUP_STATUS.INACTIVE },
            { trx }
        )

        return supplierId
    })

    return {
        is_success: true,
        data: { supplier_id: supId },
    }
}

exports.getSuggestSuppliers = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            from_province_code: Joi.string(),
            from_province_id: Joi.string(),
            from_district_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }
    const data = await Supplier.getSuggestSuppliers(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getSuggestWarehousing = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const { supplier_id, ...query } = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            supplier_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    option.supplier_id = supplier_id
    if (user.tenant_id) {
        option.tenant_id = user.tenant_id
    }
    const data = await SupplierWareHousing.sellerGetSupplierWareHousings(
        option,
        query
    )

    return {
        is_success: true,
        ...data,
    }
}

exports.supplierProfile = async (request) => {
    const { user } = request

    const supplier = await Supplier.getSupplier({ partner_id: user.partner_id })

    const data = await Supplier.getSupplierById(supplier.id)

    if (!data) {
        throw new Error('supplier_id_not_found')
    }

    return {
        is_success: true,
        data,
    }
}

exports.supplierUpdateProfile = async (request) => {
    const { user } = request
    const { ...values } = await Joi.object()
        .keys({
            name: Joi.string(),
            description: Joi.string().allow(null),
            thumb: Joi.object().allow(null),
            logo: Joi.object().allow(null),
            images: Joi.array().allow(null),
            contact: Joi.object().allow(null),
            phone_number: Joi.string(),
            contact_email: Joi.string(),
            category_ids: Joi.array().items(),
            address: Joi.object().allow(null),
            metadata: Joi.object({
                user_info: Joi.object({
                    representative_name: Joi.string(),
                    identity_card: Joi.string(),
                    images_representative_before: Joi.object()
                        .allow(null)
                        .required(),
                    images_representative_after: Joi.object()
                        .allow(null)
                        .required(),
                }),
                business_info: Joi.object({
                    category_license: Joi.string(),
                    images_license: Joi.array().allow(null),
                }),
                billing_info: Joi.object({
                    sub_title: Joi.string(),
                    account_name: Joi.string(),
                    account_number: Joi.string(),
                    exp_date: Joi.string().allow(null),
                    bank_info_id: Joi.string(),
                }),
            }).allow(null),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })

    values.category_ids = JSON.stringify(values.category_ids)

    values.register_status = 'pending_for_review_after_update'

    const supplier = await Supplier.getSupplier({ user_id: user.id })

    const data = await Supplier.getSupplierById(supplier.id)

    if (!data) {
        throw new Error('supplier_id_not_found')
    }

    await Supplier.updateSupplierById(supplier.id, values)

    return {
        is_success: true,
    }
}

exports.supplierUpdateSetting = async (request) => {
    const { user } = request
    const { ...values } = await Joi.object()
        .keys({
            min_price_selected_type: Joi.number().default(0),
            recommend_price_selected_type: Joi.number().default(0),
            min_price_percent: Joi.number(),
            min_price_money: Joi.number(),
            recommend_price_ratio: Joi.number(),
            recommend_price_plus: Joi.number(),
            low_quantity_thres: Joi.number(),
        })
        .validateAsync({ ...request.body }, { stripUnknown: true })
    const supplier = await Supplier.getSupplier({ user_id: user.id })

    const data = await Supplier.getSupplierById(supplier.id)

    if (!data) {
        throw new Error('supplier_id_not_found')
    }

    await Supplier.updateSupplierById(supplier.id, values)

    return {
        is_success: true,
    }
}
