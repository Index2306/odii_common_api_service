const { attachPaginate } = require('knex-paginate')
const config = require('../config')

attachPaginate()

// eslint-disable-next-line import/order
const knex = require('knex')({
    client: 'pg',
    connection: config.postgresqlUrl,
})

const doPagination = async (query, options) => {
    const result = await query
        .orderBy(options.order_by || 'id', options.reverse ? 'desc' : 'asc')
        .paginate({
            perPage: options.limit || 15,
            currentPage: options.page || 1,
            isLengthAware: true,
        })
        .catch((e) => {
            throw new Error(e.message)
        })

    return {
        pagination: {
            total: result.pagination.total,
            last_page: result.pagination.lastPage,
        },
        data: result.data,
    }
}

const getKnex = (tableName, trx) => {
    if (trx) return trx(tableName)

    return knex(tableName)
}

const useMyTrx = (trx, callback) => {
    if (trx) {
        return callback(trx)
    }

    return knex.transaction(callback)
}

module.exports = {
    knex,
    doPagination,
    getKnex,
    useMyTrx,
}
