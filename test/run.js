const server = require('../src/server');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function run() {
  server.start('./test/webserver.json', './test/log.json');
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
    try { cleanup(); } catch{ }
    console.error(e);
    process.exit(1);
  }
}
test();
