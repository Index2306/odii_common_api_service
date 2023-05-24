const { esClient } = require('../connections/elasticsearch')

const { ES_INDEX } = require('../constants/index')

exports.suggestProductByKeyword = async (query = {}, from, size) => {
    const baseQuery = {
        query: {
            bool: {
                must: [],
                must_not: [],
                should: [],
            },
        },
    }

    if (query.keyword && query.keyword.length > 1) {
        baseQuery.query.bool.must.push({
            multi_match: {
                query: query.keyword,
                fields: ['name'],
            },
        })
    }

    if (query.from_province_code && query.from_province_code.length > 1) {
        baseQuery.query.bool.must.push({
            match: {
                'from_location.province_code': query.from_province_code,
            },
        })
    }

    if (query.publish_status && query.publish_status.length > 1) {
        baseQuery.query.bool.must.push({
            multi_match: {
                query: query.publish_status,
                fields: ['publish_status'],
            },
        })
    }

    if (query.has_variation) {
        baseQuery.query.bool.must.push({
            multi_match: {
                query: query.has_variation,
                fields: ['has_variation'],
            },
        })
    }

    if (query.supplier_id) {
        baseQuery.query.bool.must.push({
            term: {
                'supplier.id': query.supplier_id,
            },
        })
    }

    if (query.supplier_warehousing_id) {
        baseQuery.query.bool.must.push({
            term: {
                'supplier_warehousing.id': query.supplier_warehousing_id,
            },
        })
    }

    if (query.from_price) {
        baseQuery.query.bool.must.push({
            range: {
                min_price_variation: {
                    gte: query.from_price,
                },
            },
        })
    }

    if (query.to_price) {
        baseQuery.query.bool.must.push({
            range: {
                max_price_variation: {
                    lte: query.from_price,
                },
            },
        })
    }

    if (query.from_number_of_times_pushed) {
        baseQuery.query.bool.must.push({
            range: {
                number_of_times_pushed: {
                    gte: query.from_number_of_times_pushed,
                },
            },
        })
    }

    if (query.to_number_of_times_pushed) {
        baseQuery.query.bool.must.push({
            range: {
                number_of_times_pushed: {
                    lte: query.to_number_of_times_pushed,
                },
            },
        })
    }

    if (query.from_rating) {
        baseQuery.query.bool.must.push({
            range: {
                rating: {
                    gte: query.from_rating,
                },
            },
        })
    }

    if (query.to_rating) {
        baseQuery.query.bool.must.push({
            range: {
                rating: {
                    lte: query.to_rating,
                },
            },
        })
    }

    if (query.tag) {
        baseQuery.query.bool.must.push({
            terms: {
                tags: query.tag,
            },
        })
    }

    if (query.category_id) {
        baseQuery.query.bool.must.push({
            terms: {
                product_categories_array: query.category_id,
            },
        })
    }

    if (query.filter_quantity) {
        // eslint-disable-next-line no-restricted-syntax
        for (const rangeValue of query.filter_quantity) {
            console.log(rangeValue.from)
            baseQuery.query.bool.should.push({
                range: {
                    total_quantity: {
                        gte: rangeValue.from,
                        lte: rangeValue.to,
                    },
                },
            })
        }
    }

    if (query.filter_times_pushed) {
        // eslint-disable-next-line no-restricted-syntax
        for (const rangeValue of query.filter_times_pushed) {
            console.log(rangeValue.from)
            baseQuery.query.bool.should.push({
                range: {
                    number_of_times_pushed: {
                        gte: rangeValue.from,
                        lte: rangeValue.to,
                    },
                },
            })
        }
    }

    return esClient
        .search({
            index: ES_INDEX.PRODUCT,
            from,
            size,
            body: baseQuery,
        })
        .then((result) => ({
            data: result.body.hits.hits,
            total: result.body.hits.total.value,
        }))
        .catch((error) => {
            console.log('suggestProductByKeyword err ', error)

            return []
        })
}
// exports.suggestProductCateByKeyword = async (query = {}, from, size) => {
//     const baseQuery = {
//         query: {
//             bool: {
//                 must: [],
//                 must_not: [],
//                 should: [],
//             },
//         },
//     }

//     if (query.keyword && query.keyword.length > 1) {
//         baseQuery.query.bool.must.push({
//             multi_match: {
//                 query: query.keyword,
//                 fields: ['cat_path'],
//             },
//         })
//     }

//     let index = ES_INDEX.DEV_PRODUCT_CATEGORY
//     if (process.env.NODE_ENV !== 'dev') {
//         index = process.env.ES_PRODUCTION_PROD_CATE
//     }

//     console.log('index: ', index)

//     return esClient
//         .search({
//             index,
//             from,
//             size,
//             body: baseQuery,
//         })
//         .then((result) => ({
//             data: result.body.hits.hits,
//             total: result.body.hits.total.value,
//         }))
//         .catch((error) => {
//             console.log('suggestProductCateByKeyword err ', error)

//             return []
//         })
// }
