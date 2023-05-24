import RequireRoles from '../../utils/require-permision.helper'

const TemplateCtl = require('../../controllers/template')

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/artwork-templates',
        RequireRoles.adminProduct(fastify),
        TemplateCtl.getTemplates
    )

    fastify.post(
        '/admin/artwork-template',
        RequireRoles.adminProduct(fastify),
        TemplateCtl.createTemplate
    )

    fastify.put(
        '/admin/artwork-template/:id',
        RequireRoles.adminProduct(fastify),
        TemplateCtl.updateTemplate
    )

    fastify.get(
        '/admin/artwork-template/:id',
        RequireRoles.adminProduct(fastify),
        TemplateCtl.getTemplateDetail
    )

    fastify.get(
        '/seller/artwork-frame-template',
        RequireRoles.partnerProduct(fastify),
        TemplateCtl.getIgmEditorFrameTemplate
    )
}

module.exports = routes
