let mod = {};
module.exports = mod;

const http = require('http');
const config = require('./config.js');
const Router = require('./router.js');

let router;
let server;

function process(request, response){
  router.navigate(this, request, response);
}

/**Start web server. 
 * configFile: specify a custom path to a config file
 * forceReload: reload settings file every time you call start.
 */
mod.start = function(configFile = 'webserver.json', forceReload = false){
  config.load(settings => {
    router = new Router(settings);
    server = http.createServer(function(request, response){
      process(request, response);
    });
    server.listen(settings.server.port);
    console.log(`Server running at http://127.0.0.1:${settings.server.port}/`);
  }, configFile, forceReload);
}

/**Stop web server. 
 * abortProcess: Also abort Node process
 */
mod.stop = function(abortProcess = false){
  server.removeAllListeners()
  console.log('Web server stopped!');
  if(abortProcess) {
    console.log('Aborting Node Process...');
    process.abort();
  }
}
