const { knex } = require('../connections/pg-general')

exports.getBasicSup = (key = 's', name = 'supplier') =>
    knex.raw(
        `json_build_object('id', ${key}.id, 'name', ${key}.name, 'status', ${key}.status,
         'logo', ${key}.logo, 'thumb', ${key}.thumb, 'rating', ${key}.rating, 'publish_status', ${key}.publish_status )
          as ${name}`
    )
exports.getBasicSupWithSetting = (key = 's', name = 'supplier') =>
    knex.raw(
        `json_build_object('id', ${key}.id, 'name', ${key}.name, 'status', ${key}.status,
         'logo', ${key}.logo, 'thumb', ${key}.thumb, 'rating', ${key}.rating, 'publish_status',
          ${key}.publish_status, 'low_quantity_thres', ${key}.low_quantity_thres, 'min_price_percent', ${key}.min_price_percent,
          'min_price_money', ${key}.min_price_money, 'recommend_price_ratio', ${key}.recommend_price_ratio, 'recommend_price_plus', ${key}.recommend_price_plus, 
          'min_price_selected_type', ${key}.min_price_selected_type, 'recommend_price_selected_type', ${key}.recommend_price_selected_type )
          as ${name}`
    )

exports.getBasicProduct = (key = 'p', name = 'product') =>
    knex.raw(
        `json_build_object('id', ${key}.id, 'name', ${key}.name, 'status', ${key}.status,
         'thumb', ${key}.thumb, 'vendor', ${key}.vendor )
          as ${name}`
    )

exports.getBasicStore = (key = 'store', name = 'store') =>
    knex.raw(
        `json_build_object('id', ${key}.id, 'name', ${key}.name,
        'platform', ${key}.platform, 'status', ${key}.status, 'auth_status', ${key}.auth_status,
        'platform_shop_id', ${key}.platform_shop_id, 'logo', ${key}.logo) as ${name}`
    )

exports.getBasicWarehousing = (key = 'sw', name = 'supplier_warehousing') =>
    knex.raw(
        `json_build_object('id', ${key}.id, 'name', ${key}.name,
        'phone', ${key}.phone, 'thumb', ${key}.thumb) as ${name}`
    )
exports.getBasicLocation = (key = 'from', name = 'from_location') =>
    knex.raw(`row_to_json("${key}".*) as ${name}`)

exports.getBasicUser = (key = 'user', name = 'user') =>
    knex.raw(
        `json_build_object('id', "${key}".id, 'full_name', "${key}".full_name,
        'avatar', "${key}".avatar, 'phone', "${key}".phone, 'email', "${key}".email, 'status', "${key}".status) as ${name}`
    )
