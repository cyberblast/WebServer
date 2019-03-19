const server = require('../src/server');

server.onError(error => {
  console.error(error);
});
server.start('./test/webserver.json');
