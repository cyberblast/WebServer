let mod = {};
module.exports = mod;

const http = require('http');
const config = require('./config');
const RequestContext = require('./context');
const Router = require('./router');
const errorPage = '<html><body><div style="height: 80%;display: flex;align-items: center;justify-content: center"><div style="max-width:600px;"><h1 style="font: 40px sans-serif;">STATUS</h1><span style="font: 14px consolas;">ERROR</span><div><span style="font: 14px consolas;"><a href="/">Back to the roots</a></span></div></div></div></body</html>';

let router;
let server;
let errorCallback;

function handleError(error, response, code, message){
  if(errorCallback != null){
    errorCallback(error);
  }
  respondError(error, response, code, message);
}

function respondError(error, response, code, message){
  if(response != null){
    if( response.writable === true && response.headersSent !== true){
      response.setHeader('Error', error);
      response.writeHead(code);
      const status = `${code} ${response.statusMessage}`;
      const errMarkup = errorPage.replace('STATUS', status).replace('ERROR', message || '');
      response.write(errMarkup);
    }
    if(response.finished !== true) response.end();
  }
}

function startServer(settings){
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
    server = http.createServer((request, response) => {
      const context = new RequestContext(mod);
      context.request = request;
      context.response = response;
      process(context, settings);
    });
    server.listen(settings.server.port);
    console.log(`Server running at http://127.0.0.1:${settings.server.port}/`);
  } catch(e){
    handleError(e);
    router = null;
    server = null;
  }
}

function process(context, settings){
  const headers = settings.server.headers;
  if(headers !== undefined){
    for(let head in headers){
      const value = headers[head];
      context.response.setHeader(head, value);
    }
  }
  router.navigate(context);
}

/**  
 * Register an error handler to track internal errors.  
 * Use like that: `server.onError(err => { console.error(err); })`
 * @param {function({error: (string|Error)}): void} callback - Function to call on error
 */
mod.onError = function(callback){
  errorCallback = callback;
}

/**
 * Send a standardized error to the client.  
 * Will also be called for all internal errors.
 * @param {string|Error} error - Original error to send via header
 * @param {http.ServerResponse} response - Current response object
 * @param {number} [code] - Http response status code  
 * default = 500
 * @param {string} [message] - Additional message to add to the response body, displayed on the page  
 * default = null
 */
mod.respondError = function(error, response, code = 500, message = null){
  respondError(error, response, code, message);
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
    startServer, 
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
