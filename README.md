### Facebook birthday bot
Simple Facebook web scraper. It is designed to run once a day. Scraper logs to Facebook and make wish for all your friends, which have birthday at that day. It uses headless chrome (or chromium). You can optionally set webhook and bot will do post on this hook in IFTT format ({value1: 'result'})

## Build
Scraper supports free mods:
  * Local - it runs on your local machine and expects chrome or chromium installed
  * Lambda - servless integration file is included. Please extract file **headless_chrome.zip** for chrome binary
  * Docker - special AWS lambda like docker file. Same as above - please extract **headless_chrome.zip** binary

## Run
1) Create your **config.js** file from **config.template.js** and fill your details
    * Use ***./headless-chrome/headless_shell*** as CHROME_PATH for LAMBDA/DOCKER env
    * Use chrome/chromium binary in PATH for CHROME_ENV 
2) Run:
    * npm run local - local enviroment
    * npm run start - serverless deployment
    * npm run docker - docker run
3) Optionally set env LOG_LEVEL for appropriate winston log level


