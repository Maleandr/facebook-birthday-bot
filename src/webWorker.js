/**
 * Created by venclik on 10/05/2017.
 */

const CDP = require('chrome-remote-interface')
const Promise = require('bluebird')

const MAIN_URL = 'https://www.facebook.com/'
const BIRTHDAY_URL = 'https://www.facebook.com/birthdays/'
const REDIRECT_URL = 'https://www.facebook.com/ajax/stream/inline.php'

const RESULT = {OK: 'ok', NO_BIRTHDAYS: 'no_birthdays'}

const winston = require('winston')

let isLogged = false
let wished = []

class WebWorker {
  constructor (username, password, wish, screenshotName) {
    this.username = username
    this.password = password
    this.wish = wish
    this.screenshotName = screenshotName
  }

  /**
   * Start validation loop
   */
  start () {
    return new Promise((resolve, reject) => {
      CDP((client) => {
        // Evaluate html after page has loaded.
        client.Page.loadEventFired((timeout) => {
          winston.log('debug', timeout)

          this._processUrl(client)
            .then((result) => {
              if (result != null) {
                client.close()
                resolve({result, wished})
              }
            })
            .catch((e) => {
              winston.log('error', 'processing failed', e)
              client.close()
              reject(e)
            })
        })

        this._initClient(client)
          .catch((err) => {
            client.close()
            reject(err)
          })
      }).on('error', (err) => {
        reject(err)
      })
    })
  }

  /**
   * Init browser client
   * @param client
   * @returns {Promise.<TResult>}
   * @private
   */
  _initClient (client) {
    return Promise.join(
      client.Network.enable(),
      client.Page.enable()
    ).then(() => WebWorker._loadMainPage(client.Page))
  }

  /**
   * Process new url in browser
   * @param client
   * @returns {Promise.<TResult>}
   * @private
   */
  _processUrl (client) {
    return this._checkCurrentUrl(client.Runtime)
      .then((url) => {
        winston.log('debug', url)

        switch (url) {
          case MAIN_URL:
            if (isLogged) {
              return WebWorker._loadBirthdays(client.Page)
            } else {
              return this._login(client.Runtime)
                .then((result) => {
                  isLogged = result
                })
            }

          case BIRTHDAY_URL:
            return this._doWish(client.Runtime)

          case REDIRECT_URL:
            return WebWorker._loadBirthdays(client.Page)

          default:
            throw new Error('Loaded to unknown url')
        }
      })
  }

  /**
   * Post wish to facebook
   * @param Runtime
   * @returns {Promise.<TResult>}
   * @private
   */
  _doWish (Runtime) {
    winston.log('debug', 'Doing wish...')

    let wishingName
    return Runtime.evaluate({expression: 'document.querySelector(".fbCalendarHappyBirthdayer").parentNode.querySelector("strong a").text'})
      .then((output) => {
        wishingName = output.result.value
        return Runtime.evaluate({expression: `document.querySelector(".fbCalendarHappyBirthdayer textarea").defaultValue="${this.wish}"`})
      })
      .then((output) => {
        if (output == null || output.result.subtype === 'error') {
          return wished.length === 0 ? RESULT.NO_BIRTHDAYS : RESULT.OK
        } else {
          wished.push(wishingName)
          winston.log('info', `Wished to ${wishingName}`)
          return Runtime.evaluate({expression: 'document.querySelector(".uiStreamInlineAction").submit()'})
            .then(() => {
            })
        }
      })
  }

  /**
   * Load main page in browser
   * @param Page
   * @returns {Promise.<TResult>}
   * @private
   */
  static _loadMainPage (Page) {
    winston.log('debug', 'Loading main page...')

    return Page.navigate({url: 'https://www.facebook.com/'})
      .then(() => {
      })
  }

  /**
   * Load birthday page in browser
   * @param Page
   * @returns {Promise.<TResult>}
   * @private
   */
  static _loadBirthdays (Page) {
    winston.log('debug', 'Loading birthdays...')

    return Page.navigate({url: 'https://www.facebook.com/birthdays/'})
      .then(() => {
      })
  }

  /**
   * Get current browser url
   * @param Runtime
   * @returns {Promise.<TResult>}
   * @private
   */
  _checkCurrentUrl (Runtime) {
    return Runtime.evaluate({expression: 'window.location.href'})
      .then((output) => {
        if (!output) {
          throw new Error('No url find')
        }

        if (output.result == null) {
          throw new Error('No output')
        }

        return output.result.value
      })
  }

  /**
   * Do login on FB in browser
   * @param Runtime
   * @returns {Promise.<string>}
   * @private
   */
  _login (Runtime) {
    winston.log('debug', 'Logging in...')

    const email = `document.getElementById("email").value = document.getElementById("email").defaultValue = "${this.username}";`
    const password = `document.getElementById("pass").value = document.getElementById("pass").defaultValue = "${this.password}";`

    return Runtime.evaluate({expression: email})
      .then(() => Runtime.evaluate({expression: password}))
      .then(() => Runtime.evaluate({expression: 'document.getElementById("loginbutton").children[0].click();'}))
      .then(() => true)
  }
}

module.exports = WebWorker
