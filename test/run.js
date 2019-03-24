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
  server.onError(onError);
  server.start('./test/webserver.json');

  await sleep(5000);
    
  server.stop();
}

test();
/* 
TODO: 
* Create Client
* Call static pages
* Call api handlers
* validate results
* log results
* present results on a page
*/