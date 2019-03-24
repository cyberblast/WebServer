const server = require('../src/server');

function onError(e){
  throw e;
}

server.onError(onError);
server.start('./test/webserver.json');

/* 
TODO: 
* Create Client
* Call static pages
* Call api handlers
* validate results
* log results
* present results on a page
*/