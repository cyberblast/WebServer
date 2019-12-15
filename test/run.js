const server = require('../src/server');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function test() {
  server.start('./test/webserver.json', './test/log.json');

  /*
  TODO: Do some testing:
  * Create Client
  * Call static pages
  * Call api handlers
  * validate results
  * log results
  * (present results on a page)
  */

  await sleep(5000);

  server.stop();
}

test();
