const url = require('url');
const path = require('path');
const events = require('events');
const BlobLoader = require('./blobLoader');
const contentType = require('./contentType');

const default404Message = 'Ooops! The file you requested was not found on the server!';

function qualifyRoute(route) {
  if(route.path.indexOf('*') > -1){
    // its a catch all route
    route.match = 'catchall';
    route.startsWith = route.path.replace('*','');
  } else if(route.path.indexOf(':') > -1){
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
    let isMatch = ( route.path === '*' || requestPath.startsWith(route.startsWith))
    if(isMatch) {
      if(route.content !== undefined){
        if(route.content.indexOf('*') > -1){
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
    if(pathParts.length !== route.parts.length) return false;
    let tokens = {};
    let isMatch = true;
    route.parts.forEach((routePart, index) => {
      if(routePart.startsWith(':')){
        tokens[routePart.substr(1)] = pathParts[index];
      } else {
        if(routePart !== pathParts[index]){
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

module.exports = class Router {
  constructor(settings, errorHandler){
    this.event = new events.EventEmitter();
    if(errorHandler) this.onError(errorHandler);
    try{
      this.loader = new BlobLoader();
      this.routes = settings.router.routes;
      this.fileRoot = settings.router.fileRoot || '';
      this.apiRoot = settings.router.apiRoot || '';
      this.blobCache = settings.server.blobCache || false;
      this.allowedModuleMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
      this.allowedFileMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
      const self = this;

      this.handler = {
        "file": (context) => {
          const filePath = self.fileRoot + context.route.content;
          console.log(`loading file "${filePath}"`);
          const useBlobCache = context.route.blobCache === true || self.blobCache;
          self.navigateFile(context, filePath, useBlobCache);
        }, 
        "module": (context) => {
          const mod = self.apiRoot + '/' + context.route.module;
          console.log(`loading module "${mod}" to run "${context.route.function}"`);
          self.navigateModule(context, mod, context.route.function);
        }
      };
      
      this.navigateModuleMethods = {
        GET: (context, mod, func) => {
          const content = self.runModule(context, mod, func);
          if(content!= null && context.response.finished === false) context.response.write(content);
          context.response.end();
        },
        HEAD: (context, mod, func) => {
          // dont set body content
          self.runModule(context, mod, func);
          context.response.end();
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
                  self.handleError(`Request data length exceeds ${1e6} bytes. Request connection terminated.`, 413);
                  context.request.connection.destroy();
              }
          });
          context.request.on('end', function () {
            context.data = rawData;
            const content = self.runModule(context, mod, func);
            if(content!= null && context.response.finished === false) context.response.write(content);
            context.response.end();
          });
        },
        OPTIONS: (context) => {
          self.processOptions(context, this.allowedModuleMethods);
        }
      };

      this.routes.forEach(qualifyRoute);
    }catch(e){
      handleError(e);
    }
  }

  onError(callback){
    this.event.on('error', callback);
  }
  handleError(err, serverContext, code = 404, message = null){
    this.event.emit('error', err, serverContext, code, message);
  }

  navigate(context){
    const requestPath = url.parse(context.request.url).pathname;
    context.client = context.request.socket.remoteAddress.split(':').pop();
    console.log(`Request for "${requestPath}" received from ${context.client}`);

    context.route = this.selectRoute(requestPath);

    if(context.route === undefined){
      this.handleError(`No route found for path "${requestPath}"!`, context, 404, default404Message);
      return;
    }

    const handler = this.handler[context.route.handler];
    if(handler !== undefined){
      this.handler[context.route.handler](context);
    } else {
      this.handleError(`Unknown route handler "${context.route.handler}"`, context, 500, `Error in webserver configuration file`);
    }
  }

  selectRoute(requestPath){
    let matchResult;
    const matchSelector = route => {
      const selector = match[route.match];
      if( selector === undefined ) return false;
      matchResult = match[route.match](route, requestPath);
      return matchResult.isMatch;
    }
    let route = this.routes.find(matchSelector);
    if(route !== undefined) return Object.assign({}, route, matchResult.tokens);
  }

  navigateFile(context, filePath, useBlobCache){
    if(!filePath){
      this.handleError('Unable to handle empty path request!', context, 500);
      return;
    }
    if('OPTIONS' === context.request.method){
      this.processOptions(context, this.allowedFileMethods);
      return;
    }
    if(this.allowedFileMethods.includes(context.request.method)){        
      const self = this;
      const onLoaded = function (err, data) {
        if (err) {
          // classic 404
          self.handleError(err && err.message ? err.message : err, context, 404, default404Message);
          return;
        }
        context.response.writeHead(200, {'Content-Type': contentType.get(filePath)});
        if(context.request.method !== 'HEAD')
          context.response.write(data);
        context.response.end();
      };
      this.loader.get(filePath, onLoaded, useBlobCache);
    } else {
      // method not allowed for static file requests
      self.handleError(`Request method ${context.method.request} is not allowed for that request path`, context, 405);
    }
  }

  navigateModule(context, modPath, func){
    const self = this;
    let mod;
    try {
      const normalized = path.resolve(modPath).toLowerCase();
      mod = require(normalized);
      if(mod === undefined || mod[func] === undefined){
        // function not found
        self.handleError(`No endpoint fount for requested module "${modPath}", function "${func}"!`, context, 404, default404Message);
        return;
      }
    } catch(e){
      // module not found
      this.handleError(e, context, 404, default404Message);
      return;
    }
    const method = this.navigateModuleMethods[context.request.method];
    if(method === undefined){
      this.handleError(`Unable to process request method ${context.request.method}!`, context, 405);
      return;
    }
    method(context, mod, func);
  }

  runModule(context, mod, func){
    let content = null;
    try{
      content = mod[func](context);
    }catch(e){
      this.handleError(e, context, 500);
    }
    return content;
  }

  processOptions(context, allowedMethods){
    const acrm = context.request.getHeader('access-control-request-method');
    const acrh = context.request.headers['access-control-request-headers'];
    const origin = context.request.headers['origin'];
    if(acrm === undefined && acrh === undefined && origin === undefined){
      // not a cors preflight
      context.response.setHeader('Allow', allowedMethods);
    } else {
      // cors preflight
      context.response.setHeader("Access-Control-Allow-Credentials", "false");
      if(origin !== null){
        // TODO: make allowed cors origin configurable
        context.response.setHeader('Access-Control-Allow-Origin', origin);
        if(origin !== '*') // Add Origin to Vary Header, if Access-Control-Allow-Origin != * or null
          context.response.setHeader('Vary', 'Origin');
      }
      if(acrm !== null){
        context.response.setHeader('Access-Control-Allow-Methods', allowedMethods);
      }
      if(acrh !== null){
        // TODO: make allowed headers configurable
        context.response.setHeader('Access-Control-Allow-Headers', acrh);
      }
    }
    context.response.end();
  }
}
