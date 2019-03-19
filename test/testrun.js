const server = require('../src/server');
server.start('./test/webserver.json');

server.onError(error => {
  console.error(error);
})