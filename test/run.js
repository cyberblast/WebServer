const server = require('../src/server');

function onError(e){
  throw e;
}

function sleep(ms){
  return new Promise(resolve=>{
    setTimeout(resolve,ms)
  })
}

async function test(){  
  server.start('./test/webserver.json', './test/log.json');
  //server.onError(onError);

  await sleep(5000);
    
  server.stop();
}

test();
/* 
TODO: Do some testing:
* Create Client
* Call static pages
* Call api handlers
* validate results
* log results
* present results on a page
*/