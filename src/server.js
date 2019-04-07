let mod = {};
module.exports = mod;

const http = require('http');
const Config = require('@cyberblast/config');
const Router = require('./router');
const content = require('./content/load');
const Logger = require('@cyberblast/logger');

let httpServer, logger, router, config;

async function respondError(error, serverContext, code, message) {
  if (serverContext == null) return;
  if (serverContext.response != null) {
    if (serverContext.response.finished === false && serverContext.response.writable === true && serverContext.response.headersSent !== true) {
      logger.log({
        category: logger.category.webserver,
        severity: logger.severity.Verbose,
        message: `Creating Error Response`
      });
      if (error != null) serverContext.response.setHeader('Error', error);
      if (code != null) serverContext.response.writeHead(code);
      if (serverContext.request.method !== 'HEAD') {
        const status = code ? `${code} ${serverContext.response.statusMessage}` : '';
        const errPage = await content('errorPage.html');
        if (errPage) {
          const errMarkup = errPage.toString().replace('STATUS', status).replace('ERROR', message || '');
          serverContext.response.write(errMarkup);
        } else serverContext.response.write(`${status}<br/>${message}`);
      }
    }
    if (serverContext.response.finished !== true) serverContext.response.end();
  }
}

function startServer() {
  // Create Router
  try {
    router = new Router(config.settings, logger);
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Verbose,
      message: `Router created.`
    });
  }
  catch (e) {
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Error,
      message: `Error creating router.`,
      data: e
    });
    return;
  }

  // Create Server
  try {
    httpServer = http.createServer((request, response) => {
      logger.log({
        category: logger.category.webserver,
        severity: logger.severity.Verbose,
        message: `Incoming request from '${request.socket.remoteAddress}' for '${request.method} ${request.url}'.`
      });
      const context = { server: mod };
      context.request = request;
      context.response = response;
      process(context);
    });
    httpServer.listen(config.settings.server.port);
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Info,
      message: `Server up & listening at http://127.0.0.1:${config.settings.server.port}/`
    });
  } catch (e) {
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Error,
      message: `Error creating http server at 'http://127.0.0.1:${config.settings.server.port}/'.`,
      data: e
    });
    httpServer = null;
  }
}

function process(context) {
  // set static headers
  context.response.setHeader('Server', 'cyberblast');
  const headers = config.settings.server.headers;
  if (headers !== undefined) {
    for (let head in headers) {
      const value = headers[head];
      context.response.setHeader(head, value);
    }
  }
  // process request
  try {
    router.navigate(context);
  }
  catch (e) {
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Error,
      message: `Unexpected Error`,
      respond: {
        error: e,
        serverContext: context,
        code: 500,
        message: `Unexpected Error`
      },
      data: e
    });
  }
}

/**
 * Send a standardized error to the client.  
 * Will also be called for all internal errors.
 * @param {string|Error} error - Original error to send via header
 * @param {any} context - Execution context
 * @param {number} [code] - Http response status code  
 * default = 500
 * @param {string} [message] - Additional message to add to the response body, displayed on the page  
 * default = null
 */
mod.respondError = async function(error, context, code = 500, message = null) {
  await respondError(error, context, code, message);
}

/**
 * Check if a log event is also meant to create a http response error page
 */
function logResponse(logEvent) {
  if (logEvent.respond !== undefined) {
    respondError(
      logEvent.respond.error,
      logEvent.respond.serverContext,
      logEvent.respond.code,
      logEvent.respond.message);
  }
}

/**
 * Start web server. 
 * @param {string} [webConfigFile] - path to config file for web server settings.  
 * default: 'webserver.json'
 * @param {string} [logConfigFile] - path to config file for logging settings.  
 * default: 'log.json'
 */
mod.start = async function(webConfigFile = 'webserver.json', logConfigFile = 'log.json') {
  logger = new Logger(logConfigFile);
  await logger.init();
  logger.defineCategory('webserver');
  logger.onLog(logResponse);
  mod.logger = logger;

  try {
    config = new Config(webConfigFile);
    await config.load();
  }
  catch (e) {
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Error,
      message: `Error loading web config file '${webConfigFile}'.`,
      data: e
    });
  }
  startServer(config.settings);
}

/**
 * Stop web server. 
 */
mod.stop = function() {
  logger.log({
    category: logger.category.webserver,
    severity: logger.severity.Verbose,
    message: `Stopping web server.`
  });
  if (httpServer != null) httpServer.removeAllListeners();
  if (httpServer != null) {
    httpServer.close(() => {
      logger.log({
        category: logger.category.webserver,
        severity: logger.severity.Info,
        message: `Server stopped.`
      });
      logger.close();
      httpServer.unref();
      httpServer = null;
    });
  } else {
    logger.log({
      category: logger.category.webserver,
      severity: logger.severity.Info,
      message: `Server stopped.`
    });
    logger.close();
  }
}
