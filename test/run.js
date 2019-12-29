const WebServer = require('../src/server');
let server;

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function run() {
  server = new WebServer('./test/webserver.json', './test/log.json');
  await server.start();
}

async function validate() {

  await sleep(5000);
  /*
  TODO: Do some testing:
    * Create Client
    * Call static pages
    * Call api handlers
    * validate results
    * log results
    * (present results on a page)
  */
}

function cleanup() {
  server.stop();
}

async function test() {
  try {
    await run();
    await validate();
    cleanup();
  }
  catch (e) {
    console.log('Aborting errorneous TEST run!');
    try { cleanup(); } catch{ }
    console.error(e);
    process.exit(1);
  }
}
test();
