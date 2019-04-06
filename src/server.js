let mod = {};
module.exports = mod;

const http = require('http');
const config = require('@cyberblast/config');
const Router = require('./router');
const content = require('./content/load');

let httpServer;
let errorCallback;

function handleError(error, serverContext, code, message){
  if(errorCallback != null){
    errorCallback(error);
  }
  respondError(error, serverContext, code, message);
}

async function respondError(error, serverContext, code, message){
  if(serverContext == null) return;
  if(serverContext.response != null){
    if( serverContext.response.finished === false && serverContext.response.writable === true && serverContext.response.headersSent !== true){
      serverContext.response.setHeader('Error', error);
      serverContext.response.writeHead(code);
      if(serverContext.request.method !== 'HEAD') {
        const status = `${code} ${serverContext.response.statusMessage}`;
        const errPage = await content('errorPage.html');
        if(errPage){
          const errMarkup = errPage.toString().replace('STATUS', status).replace('ERROR', message || '');
          serverContext.response.write(errMarkup);
        } else serverContext.response.write(`${status}<br/>${message}`);
      }
    }
    if(serverContext.response.finished !== true) serverContext.response.end();
  }
}

function startServer(settings){
  // Create Router
  const router = new Router(settings, handleError);

  // Create Server
  try{
    httpServer = http.createServer((request, response) => {
      const context = { server: mod };
      context.request = request;
      context.response = response;
      process(context, settings, router);
    });
    httpServer.listen(settings.server.port);
    console.log(`Server running at http://127.0.0.1:${settings.server.port}/`);
  } catch(e){
    handleError(e);
    httpServer = null;
  }
}

function process(context, settings, router){
  // set static headers
  context.response.setHeader('Server', 'cyberblast');
  const headers = settings.server.headers;
  if(headers !== undefined){
    for(let head in headers){
      const value = headers[head];
      context.response.setHeader(head, value);
    }
  }
  // process request
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
mod.respondError = function(error, serverContext, code = 500, message = null){
  respondError(error, serverContext, code, message);
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
    handleError, // onError
    startServer, // onSuccess
    configFile, // filePath
    forceReload // no caching
  );
}

/**
 * Stop web server. 
 * @param {boolean} [abortProcess] - Also abort Node process
 */
mod.stop = function(){
  httpServer.removeAllListeners();
  httpServer.close();
  console.info('Web server stopped!');
}
