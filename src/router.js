const url = require('url');
const path = require('path');
const fs = require("fs");
const { Logger, Severity } = require('@cyberblast/logger');
const BlobLoader = require('./BlobLoader');
const { contentTypeByExtension } = require('./contentType');

const default404Message = 'Ooops! The file you requested was not found on the server!';

function qualifyRoute(route) {
  if (route.path.indexOf('*') > -1) {
    // its a catch all route
    route.match = 'catchall';
    route.startsWith = route.path.replace('*', '');
  } else if (route.path.indexOf(':') > -1) {
    // its a replacement route
    route.match = 'replace';
    route.parts = route.path.split('/');
  } else {
    route.match = 'exact';
  }
};

const match = {
  catchall: (route, requestPath) => {
    let tokens = {};
    let isMatch = (route.path === '*' || requestPath.startsWith(route.startsWith))
    if (isMatch) {
      if (route.content !== undefined) {
        if (route.content.indexOf('*') > -1) {
          tokens.content = route.content.replace('*', requestPath.substr(route.startsWith.length));
        } else {
          tokens.content = route.content;
        }
      } else {
        tokens.content = requestPath;
      }
    }
    return {
      isMatch,
      tokens
    };
  },
  replace: (route, requestPath) => {
    const pathParts = requestPath.split('/');
    if (pathParts.length !== route.parts.length) return false;
    let tokens = {};
    let isMatch = true;
    route.parts.forEach((routePart, index) => {
      if (routePart.startsWith(':')) {
        tokens[routePart.substr(1)] = pathParts[index];
      } else {
        if (routePart !== pathParts[index]) {
          isMatch = false;
        }
      }
    });
    return {
      isMatch,
      tokens
    };
  },
  exact: (route, requestPath) => {
    return {
      isMatch: route.path === requestPath
    }
  }
}

const getDirectories = source => {
  return fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

module.exports = class Router {
  /**
   * Instanciate a new Router
   * @param {any} settings 
   * @param {Logger} logger 
   */
  constructor(settings, logger) {
    this.logger = logger;
    this.category = logger.category.webserver;
    this.loader = new BlobLoader();
    this.routes = settings.router.routes;
    this.fileRoot = settings.router.fileRoot || '';
    this.apiRoot = settings.router.apiRoot || '';
    this.blobCache = settings.server.blobCache || false;
    this.allowedApiMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
    this.allowedFileMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
    const self = this;

    if (settings.router.modulesRoot !== undefined) {
      const modules = getDirectories(settings.router.modulesRoot);
      if (settings.router.webmodule === undefined) {
        settings.router.webmodule = {};
      }
      modules.forEach(mod => {
        if (settings.router.webmodule[mod] === undefined) {
          settings.router.webmodule[mod] = `${settings.router.modulesRoot}/${mod}`;
        }
      });
    }

    if (settings.router.webmodule !== undefined) {
      Object.keys(settings.router.webmodule).forEach(name => {
        const path = settings.router.webmodule[name];
        this.routes.unshift({
          handler: 'api',
          path: `/$api/${name}/:function`,
          module: path + '/api.js',
          absolut: true
        });
        this.routes.unshift({
          handler: 'file',
          path: '/$component/' + name + '/*',
          content: path + '/*',
          absolut: true
        });
        this.routes.unshift({
          handler: 'file',
          path: '/$component/' + name,
          content: path + '/component.mjs',
          absolut: true
        });
      });
    }

    this.handler = {
      'file': async (context) => {
        const filePath = (context.route.absolut === true ? '' : self.fileRoot) + context.route.content;
        const useBlobCache = context.route.blobCache === true || self.blobCache;
        await self.navigateFile(context, filePath, useBlobCache);
      },
      'api': async (context) => {
        const mod = (context.route.absolut === true ? '' : (self.apiRoot + '/')) + context.route.module;
        self.navigateApi(context, mod, context.route.function);
      }
    };

    this.navigateApiMethods = {
      GET: (context, mod, func) => {
        self.runApi(context, mod, func).then(content => {
          if (content != null && context.response.finished === false) context.response.write(content);
          context.response.end();
        });
      },
      HEAD: (context, mod, func) => {
        // dont set body content
        self.runApi(context, mod, func).then(() => context.response.end());
      },
      POST: (context, mod, func) => {
        let rawData;
        rawData = '';
        context.request.on('data', chunk => {
          rawData += chunk;
          // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
          // TODO: make max upload limit configurable
          if (rawData.length > 1e6) {
            // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
            const message = `Request data length exceeds ${1e6} bytes. Request connection terminated.`;
            this.logger.log({
              category: this.category,
              severity: Severity.Warning,
              message
            });
            context.response.setHeader('Error', message);
            context.response.writeHead(413);
            context.response.end();
            context.request.connection.destroy();
          }
        });
        context.request.on('end', function() {
          context.data = rawData;
          self.runApi(context, mod, func).then(content => {
            if (content != null && context.response.finished === false) context.response.write(content);
            context.response.end();
          });
        });
      },
      OPTIONS: (context) => {
        self.processOptions(context, this.allowedApiMethods);
      }
    };

    this.routes.forEach(qualifyRoute);
  }

  /**
   * 
   * @param {import('./server').ServerContext} context 
   */
  async navigate(context) {
    const requestPath = url.parse(context.request.url).pathname;
    context.client = context.request.socket.remoteAddress.split(':').pop();
    context.route = this.selectRoute(requestPath);

    if (context.route === undefined) {
      this.logger.log({
        category: this.category,
        severity: Severity.Error,
        message: `No route found for path "${requestPath}"!`,
        // @ts-ignore
        respond: {
          error: `No route found for path "${requestPath}"!`,
          serverContext: context,
          code: 404,
          message: default404Message
        }
      });
      return;
    }

    const handler = this.handler[context.route.handler];
    if (handler !== undefined) {
      await this.handler[context.route.handler](context);
    } else {
      this.logger.log({
        category: this.category,
        severity: Severity.Error,
        message: `Unknown route handler "${context.route.handler}"`,
        // @ts-ignore
        respond: {
          error: `Unknown route handler "${context.route.handler}"`,
          serverContext: context,
          code: 500,
          message: `Error in webserver configuration file.`
        }
      });
    }
  }

  selectRoute(requestPath) {
    let matchResult = {};
    const matchSelector = route => {
      const selector = match[route.match];
      if (selector === undefined) return false;
      matchResult = match[route.match](route, requestPath);
      return matchResult.isMatch;
    }
    let route = this.routes.find(matchSelector);
    if (route !== undefined) return Object.assign({}, route, matchResult.tokens);
  }

  /**
   * 
   * @param {import('./server').ServerContext} context 
   * @param {string} filePath 
   * @param {boolean} useBlobCache 
   */
  async navigateFile(context, filePath, useBlobCache) {
    this.logger.log({
      category: this.category,
      severity: Severity.Verbose,
      message: `Navigating to File '${filePath}'.`
    });
    if (!filePath) {
      this.logger.log({
        category: this.category,
        severity: Severity.Error,
        message: 'Unable to handle empty path request!',
        // @ts-ignore
        respond: {
          error: 'Unable to handle empty path request!',
          serverContext: context,
          code: 500
        }
      });
      return;
    }
    if ('OPTIONS' === context.request.method) {
      this.processOptions(context, this.allowedFileMethods);
      return;
    }
    if (this.allowedFileMethods.includes(context.request.method)) {
      try {
        const file = await this.loader.get(filePath, useBlobCache);
        context.response.writeHead(200, { 'Content-Type': contentTypeByExtension(filePath) });
        if (context.request.method !== 'HEAD')
          context.response.write(file);
        context.response.end();
        this.logger.log({
          category: this.category,
          severity: Severity.Verbose,
          message: `File response '${filePath}' completed.`
        });
      }
      catch (e) {
        // classic 404
        this.logger.log({
          category: this.category,
          severity: Severity.Warning,
          message: `Error loading file '${filePath}'.`,
          // @ts-ignore
          respond: {
            error: e,
            serverContext: context,
            code: 404,
            message: default404Message
          },
          data: e
        });
        return;
      }
    } else {
      // method not allowed for static file requests
      const err = `Request method ${context.request.method} is not allowed for that request path`;
      this.logger.log({
        category: this.category,
        severity: Severity.Warning,
        message: err,
        // @ts-ignore
        respond: {
          error: err,
          serverContext: context,
          code: 405
        }
      });
    }
  }

  /**
   * 
   * @param {import('./server').ServerContext} context 
   * @param {string} modPath 
   * @param {string} func 
   */
  navigateApi(context, modPath, func) {
    this.logger.log({
      category: this.category,
      severity: Severity.Verbose,
      message: `Loading api module ${modPath} to call ${func}.`
    });
    let mod;
    try {
      const normalized = path.resolve(modPath).toLowerCase();
      mod = require(normalized);
      if (mod === undefined || mod[func] === undefined) {
        // function not found
        const message = `No endpoint found for requested api module "${modPath}", function "${func}"!`;
        this.logger.log({
          category: this.category,
          severity: Severity.Warning,
          message: message,
          // @ts-ignore
          respond: {
            error: message,
            serverContext: context,
            code: 404,
            message: default404Message
          }
        });
        return;
      }
    } catch (e) {
      // module not found
      this.logger.log({
        category: this.category,
        severity: Severity.Warning,
        message: `Module '${modPath}' not found.`,
        // @ts-ignore
        respond: {
          error: e,
          serverContext: context,
          code: 404,
          message: default404Message
        },
        data: e
      });
      return;
    }
    const method = this.navigateApiMethods[context.request.method];
    if (method === undefined) {
      const message = `Unable to process request method ${context.request.method}!`;
      this.logger.log({
        category: this.category,
        severity: Severity.Warning,
        message: message,
        // @ts-ignore
        respond: {
          error: message,
          serverContext: context,
          code: 405
        }
      });
      return;
    }
    method(context, mod, func);
  }

  /**
   * 
   * @param {import('./server').ServerContext} context 
   * @param {any} mod 
   * @param {string} func 
   */
  async runApi(context, mod, func) {
    try {
      return await mod[func](context);
    } catch (e) {
      this.logger.log({
        category: this.category,
        severity: Severity.Error,
        message: "Error executing api handler",
        // @ts-ignore
        respond: {
          error: e,
          serverContext: context,
          code: 500
        },
        data: e
      });
    }
  }

  /**
   * 
   * @param {import('./server').ServerContext} context 
   * @param {string[]} allowedMethods 
   */
  processOptions(context, allowedMethods) {
    this.logger.log({
      category: this.category,
      severity: Severity.Verbose,
      message: 'Creating OPTION response.',
    });
    const acrm = context.request.headers['access-control-request-method'];
    const acrh = context.request.headers['access-control-request-headers'];
    const origin = context.request.headers['origin'];
    if (acrm === undefined && acrh === undefined && origin === undefined) {
      // not a cors preflight
      context.response.setHeader('Allow', allowedMethods);
    } else {
      // cors preflight
      context.response.setHeader("Access-Control-Allow-Credentials", "false");
      if (origin !== null) {
        // TODO: make allowed cors origin configurable
        context.response.setHeader('Access-Control-Allow-Origin', origin);
        if (origin !== '*') // Add Origin to Vary Header, if Access-Control-Allow-Origin != * or null
          context.response.setHeader('Vary', 'Origin');
      }
      if (acrm !== null) {
        context.response.setHeader('Access-Control-Allow-Methods', allowedMethods);
      }
      if (acrh !== null) {
        // TODO: make allowed headers configurable
        context.response.setHeader('Access-Control-Allow-Headers', acrh);
      }
    }
    context.response.end();
  }
}
