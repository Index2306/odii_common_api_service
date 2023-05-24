const Kafka = require('node-rdkafka')
const config = require('../config')

export const {
    KAFKA_TOPIC_LAZADA_ORDER,
    KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
    KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
    KAFKA_TOPIC_STORE_CONNECT,
    KAFKA_ORDER_LAZADA_CONSUMER_GROUP_ID,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC_COMMON,
    // eslint-disable-next-line global-require
} = require('../config')

export function initTopics() {
    // Admin
    const adminClient = Kafka.AdminClient.create({
        'client.id': 'kafka-admin',
        'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
    })

    const topics = [
        {
            topic: KAFKA_TOPIC_LAZADA_ORDER,
            num_partitions: 6,
        },
        {
            topic: KAFKA_TOPIC_LAZADA_ORDER_DEAD_LETTER,
            num_partitions: 1,
        },
        {
            topic: KAFKA_TOPIC_LAZADA_ORDER_UPDATE,
            num_partitions: 6,
        },
        {
            topic: KAFKA_TOPIC_STORE_CONNECT,
            num_partitions: 1,
        },
        // {
        //     topic: KAFKA_TOPIC_ODII_ORDER_UPDATE,
        //     num_partitions: 1,
        // },
    ]

    topics.forEach((topic) => {
        adminClient.createTopic(
            {
                ...topic,
                replication_factor: 1,
            },
            (err) => {
                if (err) console.error(err.message)
            }
        )
    })
}

// initTopics()

// Kafka produccer
export const kafkaProducer = new Kafka.HighLevelProducer({
    'client.id': 'kafka',
    'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
    'retry.backoff.ms': 200,
    'message.send.max.retries': 3,
    'socket.keepalive.enable': true,
    'queue.buffering.max.messages': 100000,
    'queue.buffering.max.ms': 50,
    dr_cb: true,
})
kafkaProducer.setValueSerializer((value) => Buffer.from(JSON.stringify(value)))
kafkaProducer.setKeySerializer((key) => Buffer.from(JSON.stringify(key)))
// kafkaProducer.on('delivery-report', (err, report) => {
//     console.log(report)
// })
kafkaProducer.connect()
kafkaProducer.on('ready', () => {
    console.log('kafkaProducer is READY')
})

export function kafkaProduceEvent(topic, message, key) {
    return new Promise((resolve, reject) => {
        kafkaProducer.produce(
            topic,
            null,
            message,
            key,
            Date.now(),
            (err, offset) => {
                if (err) {
                    return reject(err)
                }
                resolve(offset)
            }
        )
    })
}

export const KAFKA_CONSUMER_DEFAULT_CONFIG = {
    'group.id': 'odii_lazada',
    'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
    'enable.auto.offset.store': false,
    'enable.auto.commit': true,
    'max.poll.interval.ms': 300000,
    'socket.timeout.ms': 1000,
}

export const KAFKA_CONSUMER_UPDATE_ORDER_CONFIG = {
    'group.id': 'odii_order_update_group',
    'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
    'enable.auto.offset.store': false,
    'enable.auto.commit': true,
    'max.poll.interval.ms': 300000,
    'socket.timeout.ms': 1000,
}

export const KAFKA_CONSUMER_COMMON_CONFIG = {
    'group.id': 'odii_common_group',
    'metadata.broker.list': config.KAFKA_BOOTSTRAP_SERVERS,
    'enable.auto.offset.store': true,
    'enable.auto.commit': true,
    'max.poll.interval.ms': 300000,
    'socket.timeout.ms': 1000,
}
