module.exports = { WebServer };

const http = require('http');
const Config = require('@cyberblast/config');
const Router = require('./router');
const content = require('./content/load');
const {
  Logger,
  Severity
} = require('@cyberblast/logger');

/**
 * @typedef {object} ServerContext - Call-specific context
 * @property {WebServer} server
 * @property {http.IncomingMessage} request
 * @property {http.ServerResponse} response
 * @property {Logger} logger
 * @property {string} client
 * @property {any} route - route node from config file
 * @property {string | Buffer} data - request post body
 */

/**
 * Web server class 
 * @class
 * @param {string} [webConfigFile] - path to config file for web server settings.  
 * default: 'webserver.json'
 * @param {string} [logConfigFile] - path to config file for logging settings.  
 * default: 'log.json'
 */
function WebServer(webConfigFile = 'webserver.json', logConfigFile = 'log.json') {
  let httpServer, router;

  const logger = new Logger(logConfigFile);
  const config = new Config(webConfigFile);

  const createServer = function() {
    return new Promise((resolve, reject) => {
      // Create Router
      try {
        router = new Router(config.settings, logger);
        logger.log({
          category: logger.category.webserver,
          severity: Severity.Verbose,
          message: `Router created.`
        });
      }
      catch (e) {
        logger.log({
          category: logger.category.webserver,
          severity: Severity.Error,
          message: `Error creating router.`,
          data: e
        });
        reject(e);
      }

      // Create Server
      let server = null;
      try {
        server = http.createServer((request, response) => {
          logger.log({
            category: logger.category.webserver,
            severity: Severity.Verbose,
            message: `Incoming request from '${request.socket.remoteAddress}' for '${request.method} ${request.url}'.`
          });
          const context = { server: this };
          context.request = request;
          context.response = response;
          process(context);
        });

        server.addListener('error', (err) => {
          logger.log({
            category: logger.category.webserver,
            severity: Severity.Error,
            message: `Error creating http server at 'http://127.0.0.1:${config.settings.server.port}/'.`,
            data: err
          });
          server = null;
          reject(err);
        });
        server.addListener('listening', () => {
          logger.log({
            category: logger.category.webserver,
            severity: Severity.Info,
            message: `Server up & listening at http://127.0.0.1:${config.settings.server.port}/`
          });
          resolve(server);
        });

        server.listen(config.settings.server.port);
      } catch (e) {
        logger.log({
          category: logger.category.webserver,
          severity: Severity.Error,
          message: `Error creating http server at 'http://127.0.0.1:${config.settings.server.port}/'.`,
          data: e
        });
        server = null;
      }
    });
  }.bind(this);

  function process(context) {
    // set static headers
    context.response.setHeader('Server', 'cyberblast');
    context.logger = logger;
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
        severity: Severity.Error,
        message: `Unexpected Error`,
        // @ts-ignore added uncommon property will trigger expected http error response via `logger.onLog(logResponse);`
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
   * Start web server. 
   * @method start
   */
  this.start = async function() {
    await logger.init();
    logger.defineCategory('webserver');
    logger.onLog(logResponse);
    //mod.logger = logger;

    try {
      await config.load();
    }
    catch (e) {
      logger.log({
        category: logger.category.webserver,
        severity: Severity.Error,
        message: `Error loading web config file '${webConfigFile}'.`,
        data: e
      });
    }
    try {
      httpServer = await createServer();
    }
    catch (e) {
      // already logged
      this.stop();
      throw e;
    }
  }

  async function respondError(error, serverContext, code, message) {
    if (serverContext == null) return;
    if (serverContext.response != null) {
      if (serverContext.response.finished === false && serverContext.response.writable === true && serverContext.response.headersSent !== true) {
        logger.log({
          category: logger.category.webserver,
          severity: Severity.Verbose,
          message: `Creating Error Response`
        });
        if (error != null) serverContext.response.setHeader('Error', error);
        if (code != null) serverContext.response.writeHead(code);
        if (serverContext.request.method !== 'HEAD') {
          const status = code ? `${code} ${serverContext.response.statusMessage}` : '';
          let errPage;
          try {
            errPage = await content('errorPage.html')
          } catch (e) {
            logger.log({
              category: logger.category.webserver,
              severity: Severity.Error,
              message: `Error loading error page`,
              data: e
            });
          }
          if (errPage) {
            const errMarkup = errPage.toString().replace('STATUS', status).replace('ERROR', message || '');
            serverContext.response.write(errMarkup);
          } else serverContext.response.write(`${status}<br/>${message}`);
        }
      }
      if (serverContext.response.finished !== true) serverContext.response.end();
    }
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
   * Send a standardized error to the client.  
   * Will also be called for all internal errors.
   * @method respondError
   * @param {string|Error} error - Original error to send via header
   * @param {ServerContext} context - Execution context
   * @param {number} [code] - Http response status code  
   * default = 500
   * @param {string} [message] - Additional message to add to the response body, displayed on the page  
   * default = null
   */
  this.respondError = async function(error, context, code = 500, message = null) {
    await respondError(error, context, code, message);
  }

  /**
   * Stop web server. 
   * @method stop
   */
  this.stop = function() {
    logger.log({
      category: logger.category.webserver,
      severity: Severity.Verbose,
      message: `Stopping web server.`
    });
    if (httpServer != null) httpServer.removeAllListeners();
    if (httpServer != null) {
      httpServer.close(() => {
        logger.log({
          category: logger.category.webserver,
          severity: Severity.Info,
          message: `Server stopped.`
        });
        logger.close();
        httpServer.unref();
        httpServer = null;
      });
    } else {
      logger.log({
        category: logger.category.webserver,
        severity: Severity.Info,
        message: `Server stopped.`
      });
      logger.close();
    }
  }
}
