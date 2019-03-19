let mod = {};
module.exports = mod;

const http = require('http');
const config = require('./config');
const Router = require('./router');

let router;
let server;
let errorCallback;

function handleError(error){
  if(errorCallback != null){
    errorCallback(error);
  }
}

function boot(settings){
  // Create Router
  try{
    router = new Router(settings);
  }
  catch(e){
    handleError(e);
    return;
  }
  router.onError(handleError);

  // Create Server
  try{
    server = http.createServer(function(request, response){
      process(request, response);
    });
    server.listen(settings.server.port);
    console.log(`Server running at http://127.0.0.1:${settings.server.port}/`);
  } catch(e){
    handleError(e);
    router = null;
    server = null;
  }
}

function process(request, response){
  router.navigate(mod, request, response);
}

/**  
 * Register an error handler.  
 * Use like that: `server.onError(err => { console.log(err); })`
 * @param {function({error: (string|error)}): void} callback - Function to call on error
 */
mod.onError = function(callback){
  errorCallback = callback;
}

/**
 * Start web server. 
 * @param {string} [configFile] - specify a custom path to a config file.  
 * default: 'webserver.json'
 * @param {boolean} [forceReload] - reload settings file every time you call start.  
 * default: false
 */
mod.start = function(configFile = 'webserver.json', forceReload = false){
  config.load(
    handleError, 
    boot, 
    configFile, 
    forceReload);
}

/**
 * Stop web server. 
 * @param {boolean} [abortProcess] - Also abort Node process
 */
mod.stop = function(abortProcess = false){
  server.removeAllListeners()
  console.log('Web server stopped!');
  if(abortProcess) {
    console.log('Aborting Node Process...');
    process.abort();
  }
}
