'use strict'

const ChromeManager = require('./chromeManager')
const WebWorker = require('./webWorker')
const AWS = require('aws-sdk')
const Promise = require('bluebird')
const request = require('request-promise')
const path = require('path')
const config = require('./configProvider')

const winston = require('winston')
winston.level = process.env['LOG_LEVEL'] || 'debug'

const encryptedEnvs = {}

module.exports.run = (event, context, callback) => {
  let promise

  if (process.env['NODE_ENV'] === 'DOCKER') {
    promise = start(config.NAME, config.PASSWORD, config.WISH, config.CHROME_PATH, config.POST_HOOK)
  } else {
    const kms = new AWS.KMS()

    promise = Promise.join(
      decryptEnv('NAME', kms),
      decryptEnv('PASSWORD', kms),
      (name, password) => {
        return start(name, password, config.WISH, config.CHROME_PATH, config.POST_HOOK)
      })
  }

  promise.then((result) => callback(null, result))
  // Don't end with error, because of lambda mandatory retry....sigh...
    .catch((e) => callback(null, e))
}

function decryptEnv (key, kms) {
  return new Promise((resolve, reject) => {
    let result = encryptedEnvs[key]
    if (!result) {
      kms.decrypt({CiphertextBlob: Buffer.from(process.env[key], 'base64')}, (err, data) => {
        if (err) {
          winston.log('error', 'Decrypt error:', err)
          reject(err)
          return
        }
        result = encryptedEnvs[key] = data.Plaintext.toString('ascii')
        resolve(result)
      })
    } else {
      resolve(result)
    }
  })
}

function start (name, password, wish, chromePath, postHook) {
  if (name == null) {
    throw new Error('Missing name')
  }

  if (password == null) {
    throw new Error('Missing password')
  }

  if (wish == null) {
    throw new Error('Missing wish')
  }

  if (chromePath == null) {
    throw new Error('Missing chrome path')
  }

  // Resolve path to bin for docker/lambda
  if (process.env['NODE_ENV'] !== 'LOCAL') {
    chromePath = path.resolve(chromePath)
  }

  const chromeManager = new ChromeManager(chromePath)

  let output
  return chromeManager.startChrome()
    .then(() => new WebWorker(name, password, wish).start())
    .then((result) => {
      output = result
    })
    .catch((e) => {
      winston.log('error', e)
    })
    .finally(() => {
      if (postHook == null) {
        return
      }

      let body
      if (output == null) {
        body = 'Bot failed'
      } else if (output.result === 'ok') {
        let wished = ''
        if (output != null) {
          // Format
          output.wished.forEach((name, index) => {
            wished += name
            wished += index === output.wished.length - 1 ? '' : ', '
          })
        }

        body = `Bot ended with ${output.result} and made wish to ${wished}`
      } else {
        body = `Bot ended with ${output.result}`
      }

      const options = {
        method: 'POST',
        body: {value1: body},
        json: true,
        uri: postHook
      }

      return request(options)
    })
    .then(() => {
      return chromeManager.kill()
    })
}

if (process.env['NODE_ENV'] === 'LOCAL') {
  start(config.NAME, config.PASSWORD, config.WISH, config.CHROME_PATH, config.POST_HOOK)
    .then(() => process.exit(0))
    .catch((e) => winston.log('error', e))
}
