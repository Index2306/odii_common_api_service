const { v4: uuidv4 } = require('uuid')
const AWS = require('aws-sdk')
const _ = require('lodash')

const { knex } = require('../connections/pg-general')
const {
    AWS_ACCESS_KEY,
    AWS_SECRET_KEY,
    AWS_REGION,
    S3_BUCKET,
    STATIC_HOST,
} = require('../config')

const s3Aws = new AWS.S3({
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY,
    region: AWS_REGION,
})

exports.uploadFileToS3 = async ({
    name,
    buffer,
    contentType,
    isKeepFileName = false,
}) => {
    let path = _.deburr(name)
    if (isKeepFileName === false) {
        path = `${uuidv4().replace(/-/g, '')}-${_.deburr(name)}`
    }
    const params = {
        Bucket: S3_BUCKET,
        Key: path,
        Body: buffer,
        ACL: 'public-read',
        ContentType: contentType,
    }
    const dataResult = await new Promise((resolve, reject) => {
        s3Aws.upload(params, (err, data) => {
            if (err) {
                return reject(err)
            }

            return resolve(data)
        })
    })

    return dataResult
}

exports.uploadFileSvc = async ({
    name,
    metadata,
    source,
    type,
    partner_id,
    contentType,
    buffer,
    isKeepFileName = false,
}) => {
    const s3Data = await exports.uploadFileToS3({
        name,
        buffer,
        contentType,
        isKeepFileName,
    })
    if (!s3Data || !s3Data.Key) throw new Error('UPLOAD_FAIL')
    const [fileId] = await knex('file_library')
        .returning('id')
        .insert({
            name,
            location: s3Data.Key,
            ...(metadata && { metadata: JSON.stringify(metadata) }),
            source,
            type,
            partner_id,
            origin: s3Data.Location,
        })

    return {
        id: fileId,
        location: s3Data.Key,
        origin: s3Data.Location,
        name,
        content_type: contentType,
        source,
        partner_id,
        host: STATIC_HOST,
        metadata,
    }
}
