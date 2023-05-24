const Joi = require('joi')
const _ = require('lodash')
const moment = require('moment')
const { parseOption } = require('../../utils/pagination')
const ProductSourceRepo = require('../../models/product-source')
const Supplier = require('../../models/supplier')
const { ACC_TYPE } = require('../../constants')

exports.addProductSource = async (request) => {
    const { user } = request

    const { ...values } = await Joi.object()
        .keys({
            name: Joi.string().required(),
            description: Joi.string().allow(null),
            thumb: Joi.object().allow(null),
            address: Joi.string().required(),
            phone: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (!supplier) {
        return {
            is_success: false,
            message: 'Không tìm thấy thông tin nhà cung cấp',
        }
    }
    const existedSrc = await ProductSourceRepo.getProductSource({
        is_deleted: false,
        supplier_id: supplier.id,
        name: values.name,
    })
    if (existedSrc) {
        return {
            is_success: false,
            message: 'Tên nguồn hàng đã tồn tại',
        }
    }
    const result = await ProductSourceRepo.insertProductSource({
        ...values,
        supplier_id: supplier.id,
        is_deleted: false,
        created_at: moment(),
        created_by: user.id,
        updated_at: moment(),
    })

    return {
        is_success: true,
        data: result,
    }
}

exports.updateProductSource = async (request) => {
    const { user } = request

    const { id, ...values } = await Joi.object()
        .keys({
            id: Joi.string().required(),
            name: Joi.string().required(),
            description: Joi.string(),
            thumb: Joi.object().allow(null),
            address: Joi.string().required(),
            phone: Joi.string().required(),
        })
        .validateAsync(
            { ...request.body, ...request.params },
            {
                stripUnknown: true,
            }
        )
    const productSrc = await ProductSourceRepo.getProductSourceById(id)
    if (!productSrc) {
        return {
            is_success: false,
            message: 'Không tìm thấy bản ghi',
        }
    }
    const existedSrc = await ProductSourceRepo.checkExisted(id, {
        is_deleted: false,
        name: values.name,
    })
    if (existedSrc) {
        return {
            is_success: false,
            message: 'Tên nguồn hàng đã tồn tại',
        }
    }
    const result = await ProductSourceRepo.updateProductSource(
        { id },
        {
            ...values,
            updated_at: moment(),
            updated_by: user.id,
        }
    )

    return {
        is_success: true,
        data: result,
    }
}
exports.getProductSources = async (request) => {
    const { user } = request

    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
            supplier_id: Joi.string(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    const supplier = await Supplier.getSupplierByPartnerId(user.partner_id)
    if (supplier) {
        option.supplier_id = supplier.id
    }

    // option.tenant_id = user.tenant_id
    const data = await ProductSourceRepo.getProductSources(option, query)

    return {
        is_success: true,
        ...data,
    }
}

exports.getSupplierProductSourceDetail = async (request) => {
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
        return {
            is_success: false,
            message: 'Không tìm thấy thông tin nhà cung cấp',
        }
    }
    option.supplier_id = supplier.id

    const data = await ProductSourceRepo.getSupProductSourceById(id, option)

    if (_.isEmpty(data)) {
        throw new Error('Không tìm thấy thông tin nguồn hàng')
    }

    return {
        is_success: true,
        data,
    }
}
