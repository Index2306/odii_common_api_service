import DesignCtl from '../../controllers/design'

import RequireRoles from '../../utils/require-permision.helper'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get(
        '/admin/designs',
        RequireRoles.adminProduct(fastify),
        DesignCtl.getDesigns
    )

    fastify.post(
        '/admin/design',
        RequireRoles.adminProduct(fastify),
        DesignCtl.createDesign
    )

    fastify.put(
        '/admin/design/:id',
        RequireRoles.adminProduct(fastify),
        DesignCtl.updateDesign
    )

    fastify.get(
        '/admin/design/:id',
        RequireRoles.adminProduct(fastify),
        DesignCtl.getDesignDetail
    )
}

module.exports = routes
