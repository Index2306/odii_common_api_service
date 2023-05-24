const { Client } = require('@elastic/elasticsearch')
const { ELASTICSEARCH_HOST, ELASTICSEARCH_PASSWORD } = require('../config')

const esClient = new Client({
    node: ELASTICSEARCH_HOST,
    auth: {
        username: 'elastic',
        password: ELASTICSEARCH_PASSWORD,
    },
})

const insertObject = (...docs) =>
    new Promise((resolve) => {
        resolve(
            esClient.index({
                index: docs.name,
                id: docs.id,
                body: docs.job,
            })
        )
    })

esClient.insertObject = insertObject

module.exports = { esClient }
