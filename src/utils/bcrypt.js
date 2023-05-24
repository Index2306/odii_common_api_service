const bcrypt = require('bcryptjs')

exports.hash = (text) => bcrypt.hashSync(text, 10)

exports.compareHash = (text, hash) => bcrypt.compareSync(text, hash)
