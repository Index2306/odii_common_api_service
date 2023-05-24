import Joi from 'joi'
import { esClient } from '../connections/elasticsearch'
import { BULL_JOBS } from '../constants'
import workerQueue from '../services/worker-queue'

exports.getProductIdToEs = async (request) => {
    try {
        const { id } = await Joi.object()
            .keys({
                id: Joi.string().required(),
            })
            .validateAsync({ ...request.params }, { stripUnknown: true })
        const { body } = await esClient.get({
            index: BULL_JOBS,
            id,
        })

        return {
            is_success: true,
            data: body,
        }
    } catch (e) {
        return {
            is_success: false,
            error_code: 'product_id_has_not_in_es',
        }
    }
}
exports.importProductIdToEs = async (request) => {
    const { product_ids } = await Joi.object()
        .keys({
            product_ids: Joi.array().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })

    await workerQueue.updateProductToWorker(product_ids)

    return {
        is_success: true,
        data: { product_ids },
    }
}
exports.importProductCategoryIdToEs = async (request) => {
    const { index } = await Joi.object()
        .keys({
            index: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    await workerQueue.updateProductCateToWorker(index)

    return {
        is_success: true,
    }
}
exports.importPlatformCategoryToEs = async (request) => {
    const { index } = await Joi.object()
        .keys({
            index: Joi.string().required(),
        })
        .validateAsync(request.body, { stripUnknown: true })
    await workerQueue.updatePlatformCateToWorker(index)

    return {
        is_success: true,
    }
}
