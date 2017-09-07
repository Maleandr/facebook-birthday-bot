/**
 * Created by venclik on 10/05/2017.
 */
'use strict'

// TODO: clean up the flags we don't need/care about
const CHROME_FLAGS = [
  '--headless', // Redundant?
  '--disable-gpu', // TODO: should we do this?
  '--window-size=1280x1696', // Letter size
  '--no-sandbox',
  '--user-data-dir=/tmp/user-data',
  '--hide-scrollbars',
  '--enable-logging',
  '--log-level=0',
  '--v=99',
  '--single-process',
  '--data-path=/tmp/data-path',

  '--ignore-certificate-errors', // Dangerous?

  // '--no-zygote', // Disables the use of a zygote process for forking child processes. Instead, child processes will be forked and exec'd directly. Note that --no-sandbox should also be used together with this flag because the sandbox needs the zygote to work.

  '--homedir=/tmp',
  // '--media-cache-size=0',
  // '--disable-lru-snapshot-cache',
  // '--disable-setuid-sandbox',
  // '--disk-cache-size=0',
  '--disk-cache-dir=/tmp/cache-dir'

  // '--use-simple-cache-backend',
  // '--enable-low-end-device-mode',

  // '--trace-startup=*,disabled-by-default-memory-infra',
  // '--trace-startup=*',
]

const ps = require('ps-node')

const os = require('os')

const childProcess = require('child_process')
const chromeInterface = require('chrome-remote-interface')
const request = require('request')

const HEADLESS_URL = 'http://127.0.0.1:9222'
const PROCESS_STARTUP_TIMEOUT = 1000 * 5

const winston = require('winston')

const Promise = require('bluebird')

class ChromeManager {
  constructor (chromePath) {
    this.chromePath = chromePath
  }

  startChrome () {
    let self = this

    return Promise.coroutine(function * () {
      yield self._spawn()
    })()
      .timeout(2 * PROCESS_STARTUP_TIMEOUT)
  }

  _spawn () {
    let self = this

    return Promise.coroutine(function * () {
      if (!self.chromePath) {
        throw new Error('Missing chrome path')
      }

      const isRunning = yield self._isChromeRunning()
      winston.log('debug', 'Is Chrome already running?', isRunning)

      if (isRunning) {
        return
      }

      const chrome = childProcess.spawn(
        self.chromePath,
        [...CHROME_FLAGS, '--remote-debugging-port=9222'],
        {
          cwd: os.tmpdir(),
          shell: true,
          detached: true,
          stdio: 'ignore'
        }
      )

      chrome.unref()

      yield self._waitUntilProcessIsReady(Date.now())

      winston.log('debug', 'Chrome spawned')
    })()
  }

  _waitUntilProcessIsReady (startTime = Date.now()) {
    return new Promise((resolve, reject) => {
      if (Date.now() - startTime < PROCESS_STARTUP_TIMEOUT) {
        request(`${HEADLESS_URL}/json`, (err, res) => {
          if (err) {
            reject(err)
          } else {
            resolve(res)
          }
        })
      }
    }).catch(() => {
      return Promise.delay(500)
        .then(() => {
          return this._waitUntilProcessIsReady(startTime)
        })
    })
  }

  _psKill (options = {command: ''}) {
    winston.log('debug', `Finding ${JSON.stringify(options)} to kill `)

    return new Promise((resolve, reject) => {
      ps.lookup(options, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    }).each((process) => {
      winston.log('debug', `Killing ${JSON.stringify(process)}`)

      return new Promise((resolve) => {
        ps.kill(process.pid, (e) => {
          if (e) {
            winston.log('debug', `Process ${JSON.stringify(process)} failed with ${e}`)
          }
          resolve()
        })
      })
    })
  }

  _isChromeRunning () {
    return Promise.coroutine(function * () {
      winston.log('debug', '\n$ ps lx\n', childProcess.execSync('ps lx').toString())

      try {
        winston.log('debug', 'CDP List:', yield chromeInterface.List())
      } catch (error) {
        winston.log('debug', 'no running chrome yet?')
      }
    })().then(() => {
      return new Promise((resolve, reject) => {
        request(`${HEADLESS_URL}/json`, {timeout: 50}, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(true)
          }
        })
      })
    }).catch(() => {
      return false
    })
  }

  kill () {
    return this._isChromeRunning()
      .then((isRunning) => {
        if (isRunning) {
          return this._psKill({command: this.chromePath})
        }
      })
  }
}

module.exports = ChromeManager
