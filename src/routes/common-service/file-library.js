const RequireRoles = require('../../utils/require-permision.helper')

const CommonCtl = require('../../controllers/common')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.post('/upload-image-file', CommonCtl.uploadImageFileCtl)

    fastify.post('/upload-file', CommonCtl.uploadFileCtl)

    fastify.post('/upload-files', CommonCtl.uploadFilesCtl)

    fastify.post(
        '/remove-bg-image',
        RequireRoles.setRateLimit(2, 1),
        CommonCtl.removeBgImageCtl
    )

    fastify.get(
        '/download-result-remove-bg',
        RequireRoles.setRateLimit(2, 1),
        CommonCtl.downloadFileCtl
    )

    fastify.post('/img-editor/upload-image', CommonCtl.uploadImageForEditorCtl)
    fastify.post(
        '/img-editor/admin/upload-sample-image',
        RequireRoles.adminProduct(fastify),
        CommonCtl.adminUploadImageFileCtl
    )
    fastify.get('/img-editor/personal-image', CommonCtl.getPersonalImage)
    fastify.get('/img-editor/sample-image', CommonCtl.getSampleImage)
    fastify.delete(
        '/img-editor/personal-image/:id',
        CommonCtl.deletePersonalImage
    )

    fastify.get(
        '/file-library/admin',
        RequireRoles.supperAdmin(fastify),
        CommonCtl.getFileLibraryByAdmin
    )
}

module.exports = routes
