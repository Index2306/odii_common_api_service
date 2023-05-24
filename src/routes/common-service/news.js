import NewsCtl from '../../controllers/news'
import RequireRoles from '../../utils/require-permision.helper'

async function routes(fastify) {
    RequireRoles.addParseTokenHook(fastify)

    fastify.get('/admin/news', NewsCtl.getNews)

    fastify.post(
        '/admin/new',
        RequireRoles.supperAdmin(fastify),
        NewsCtl.createNew
    )

    fastify.put(
        '/admin/new/:id',
        RequireRoles.supperAdmin(fastify),
        NewsCtl.updateNew
    )

    fastify.get(
        '/admin/new/:id',
        RequireRoles.supperAdmin(fastify),
        NewsCtl.getNewDetail
    )
}

module.exports = routes
