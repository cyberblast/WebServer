const server = require('../src/server');

server.onError(error => {
  console.error(error);
});
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