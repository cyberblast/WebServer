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
  constructor(settings){
    this.event = new events.EventEmitter();
    this.loader = new BlobLoader();
    this.routes = settings.router.routes;
    this.fileRoot = settings.router.fileRoot || '';
    this.apiRoot = settings.router.apiRoot || '';
    this.blobCache = settings.server.blobCache || false;
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
    this.routes.forEach(qualifyRoute);    
  }

  onError(callback){
    this.event.on('error', callback);
  }
  handleError(err, response, code = 404, message = null){
    this.event.emit('error', err, response, code, message);
  }

  navigate(context){
    const requestPath = url.parse(context.request.url).pathname;
    context.client = context.request.socket.remoteAddress.split(':').pop();
    console.log(`Request for "${requestPath}" received from ${context.client}`);

    context.route = this.selectRoute(requestPath);

    if(context.route === undefined){
      this.handleError(`No route found for path "${requestPath}"!`, context.response, 404, default404Message);
      return;
    }

    const handler = this.handler[context.route.handler];
    if(handler !== undefined){
      this.handler[context.route.handler](context);
    } else {
      this.handleError(`Unknown route handler "${context.route.handler}"`, context.response, 500, `Error in webserver configuration file`);
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
      self.handleError('Unable to handle empty path request!', context.response, 500);
      return;
    }
    const self = this;
    const onLoaded = function (err, data) {
      if (err) {
        // classic 404
        self.handleError(err && err.message ? err.message : err, context.response, 404, default404Message);
        return;
      }
      context.response.writeHead(200, {'Content-Type': contentType.get(filePath)});
      context.response.write(data);
      context.response.end();
    };
    this.loader.get(filePath, onLoaded, useBlobCache);
  }

  navigateModule(context, modPath, func){
    const self = this;
    const normalized = path.resolve(modPath).toLowerCase();
    try {
      const mod = require(normalized);
      if(mod === undefined || mod[func] === undefined){
        self.handleError(`No endpoint fount for requested module "${modPath}", function "${func}"!`, context.response, 404, default404Message);
        return;
      }

      if (context.request.method === 'POST') {
        let rawData;
        rawData = '';
        context.request.on('data', chunk => {
          rawData += chunk;
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (rawData.length > 1e6) { 
                // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                context.request.connection.destroy();
                self.handleError(`Request data length exceeds ${1e6} bytes. Request connection terminated.`);
            }
        });
        context.request.on('end', function () {
          context.data = rawData;
          self.runModule(mod, func, context);
        });
      } else if (context.request.method === 'GET') {
        self.runModule(mod, func, context);
      }

    } catch(e){
      this.handleError(e, context.response, 500);
    }
  }

  runModule(mod, functionName, context){
    const content = mod[functionName](context);
    if(content!= null && context.response.finished === false) context.response.write(content);
    context.response.end();
  }
}
