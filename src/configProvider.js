'user strict'

const config = require('config')
const env = process.env['NODE_ENV'] || 'LOCAL'
const envConfig = config[env]

if (envConfig == null) {
  throw new Error('Missing config')
}

module.exports = config[env]
