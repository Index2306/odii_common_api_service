/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const bufferImageSize = require('buffer-image-size')
const axios = require('axios')
const { v4: uuidv4 } = require('uuid')
const FormData = require('form-data')
const fs = require('fs')
const Joi = require('joi')
const { parseOption } = require('../utils/pagination')
const { uploadFileSvc } = require('../services/file-library')
const FileLibrary = require('../models/file-library')

const MAX_FILE_SIZE_IN_MB = 2

const {
    setValueEx,
    getValue,
    setObjectEx,
    getObject,
} = require('../connections/redis-cache')
const { normalizeObj } = require('../utils/common.util')

async function uploadImageBaseCtl(req, option = {}) {
    const { user } = req
    const data = await req.file()
    const { type, ...values } = await Joi.object()
        .keys({
            source: Joi.string(),
            type: Joi.string().allow(null).default(null),
        })
        .validateAsync({ ...req.query }, { stripUnknown: true })

    const buffer = await data.toBuffer()

    if (!data.mimetype.includes('image')) throw new Error('invalid_file_type')
    const dimension = bufferImageSize(buffer)
    const metadata = {
        width: dimension.width,
        height: dimension.height,
        size_in_mb: buffer.length / (1000 * 1000),
    }

    if (metadata.size_in_mb > MAX_FILE_SIZE_IN_MB)
        throw new Error(`max file size is ${MAX_FILE_SIZE_IN_MB}}Mb`)

    const resData = await uploadFileSvc({
        name: data.filename,
        buffer,
        metadata,
        contentType: data.mimetype,
        source: req.odii_source,
        type: type,
        ...(user && { partner_id: user.partner_id }),
        ...option,
    })

    return {
        is_success: true,
        data: resData,
    }
}

async function uploadImageFileCtl(req) {
    return uploadImageBaseCtl(req)
}

async function uploadImageForEditorCtl(req) {
    const { user } = req

    return uploadImageBaseCtl(req, {
        partner_id: user.partner_id,
        type: 'img_editor',
    })
}

async function adminUploadImageFileCtl(req) {
    return uploadImageBaseCtl(req, { type: 'img_editor' })
}

async function uploadFileCtl(req) {
    const { user } = req
    const data = await req.file()
    const buffer = await data.toBuffer()

    if (buffer.length / (1000 * 1000) > MAX_FILE_SIZE_IN_MB)
        throw new Error(`max file size is ${MAX_FILE_SIZE_IN_MB}}Mb`)
    const resData = await uploadFileSvc({
        name: data.filename,
        buffer,
        contentType: data.mimetype,
        metadata: { size_in_mb: buffer.length / (1000 * 1000) },
        ...(user && { partner_id: user.partner_id }),
        source: req.odii_source,
    })

    return {
        is_success: true,
        data: resData,
    }
}

async function uploadFilesCtl(req) {
    const { user } = req
    const files = req.files()
    const result = []
    for await (const file of files) {
        const buffer = await file.toBuffer()
        const resData = await uploadFileSvc({
            name: file.filename,
            buffer,
            metadata: { size_in_mb: buffer.length / (1000 * 1000) },
            contentType: file.mimetype,
            source: req.query.source,
            partner_id: user.partner_id,
        })
        result.push(resData)
    }

    return {
        is_success: true,
        data: result,
    }
}

function checkForImage(url) {
    const regex = /^https?:\/\/.*\/.*\.(png|gif|webp|jpeg|jpg)\??.*$/gim
    let result
    if (url.match(regex)) {
        result = {
            match: url.match(regex),
        }
    } else {
        result = false
    }

    return result
}

async function removeBgImageCtl(req) {
    // const { user } = req

    const formData = new FormData()
    if (req.query.url) {
        // req.query.url = req.query.url.replace('.jpeg', '.png')
        if (!checkForImage(req.query.url)) throw new Error('url_invalid')
        console.log('req.query.url = ', req.query.url)
        const downStream = await axios({
            method: 'GET',
            responseType: 'stream',
            url: req.query.url,
        })
        formData.append('file', downStream.data)
    } else {
        const data = await req.file()
        if (!data) throw new Error('something_wrong')
        if (!data.mimetype.includes('image'))
            throw new Error('invalid_file_type')
        formData.append('file', fs.createReadStream(data.filename))
    }
    console.log('formData.getHeaders() = ', formData.getHeaders())
    const config = {
        method: 'post',
        url: 'https://remove-background.net/upload',
        headers: {
            ...formData.getHeaders(),
        },
        data: formData,
        maxContentLength: 1000000000,
    }
    const upStream = await axios(config)
    if (!upStream?.data?.file_id) throw new Error('something_wrong')
    const myfileId = uuidv4().replace(/-/g, '')
    setValueEx(myfileId, 12 * 3600, upStream?.data?.file_id?.toString())

    return {
        is_success: true,
        data: {
            id: myfileId,
        },
    }
}

const downloadFileCtl = async (req) => {
    // const { user } = req
    // const data = await req.file()
    // const buffer = await data.toBuffer()
    // console.log('dhashd', req.headers)
    const fileId = req.query.file_id
    if (!fileId) throw new Error('invalid_file_id')

    const rmFileId = await getValue(fileId)

    const cacheResult = await getObject(`${rmFileId}_result`)
    if (cacheResult)
        return {
            is_success: true,
            data: cacheResult,
        }

    const res = await axios({
        method: 'GET',
        url: `https://remove-background.net/ping?id=${rmFileId}`,
    })

    const objRes = res.data

    if (objRes.done !== true && objRes !== 100) {
        return {
            is_success: true,
            data: {
                percentage: objRes.percentage,
                done: objRes.done,
            },
        }
    }
    const response = await axios({
        url: `https://remove-background.net/static/done/${objRes.output}`,
        method: 'GET',
        responseType: 'arraybuffer',
    })
    const resData = await uploadFileSvc({
        name: objRes.output,
        buffer: response.data,
        contentType: 'image/png',
        source: req.odii_source,
    })
    setObjectEx(`${rmFileId}_result`, 12 * 3600, resData)

    return {
        is_success: true,
        data: resData,
    }
}

const getPersonalImage = async (request) => {
    const { user } = request
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    option.type = 'img_editor'
    option.partner_id = user.partner_id
    const data = await FileLibrary.getListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

const getSampleImage = async (request) => {
    const option = parseOption(request.query)
    const query = await Joi.object()
        .keys({
            keyword: Joi.string().min(2),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )
    option.type = 'img_editor'
    option.is_sample = true
    const data = await FileLibrary.getListing(option, query)

    return {
        is_success: true,
        ...data,
    }
}

const deletePersonalImage = async (request) => {
    const { user } = request
    const { id } = await Joi.object()
        .keys({
            id: Joi.string().required(),
        })
        .validateAsync(
            { ...request.params },
            { stripUnknown: false, allowUnknown: true }
        )

    const data = await FileLibrary.update(
        {
            id,
            partner_id: user.partner_id,
            type: 'img_editor',
            is_deleted: false,
        },
        { is_deleted: true }
    )

    return {
        is_success: data !== 0,
    }
}

const getFileLibraryByAdmin = async (request) => {
    const option = parseOption(request.query)
    const { type } = await Joi.object()
        .keys({
            type: Joi.string().optional(),
            is_deleted: Joi.string().optional(),
        })
        .validateAsync(
            { ...request.query },
            { stripUnknown: false, allowUnknown: true }
        )

    const whereCondition = normalizeObj({ type })
    const data = await FileLibrary.getListing(
        {
            ...option,
            ...whereCondition,
        },
        { source: 'admin' }
    )

    return {
        is_success: true,
        data,
    }
}

module.exports = {
    uploadImageFileCtl,
    uploadImageForEditorCtl,
    adminUploadImageFileCtl,
    getPersonalImage,
    getSampleImage,
    uploadFileCtl,
    uploadFilesCtl,
    downloadFileCtl,
    removeBgImageCtl,
    deletePersonalImage,
    getFileLibraryByAdmin,
}
