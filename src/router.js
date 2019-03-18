const fs = require("fs");
const url = require('url');
const path = require('path');
const BlobLoader = require('./blobLoader');
const contentType = require('./contentType');

module.exports = class Router {
  constructor(settings){
    this.loader = new BlobLoader();
    this.routes = settings.router.routes;
    this.fileRoot = settings.router.fileRoot || '';
    this.apiRoot = settings.router.apiRoot || '';
    this.blobCache = settings.server.blobCache || false;
    const qualifyRoute = route => {
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
    this.routes.forEach(qualifyRoute);
    
  }

  navigate(server, request, response){
    const pathname = url.parse(request.url).pathname;
    const client = request.socket.remoteAddress.split(':').pop();
    console.log(`Request for "${pathname}" received from ${client}`);

    let route = this.selectRoute(pathname);

    if(route === undefined){      
      response.writeHead(404, {'Content-Type': 'text/html'});
      response.end();
      return;
    }

    if(route.handler === 'file'){
      const path = this.fileRoot + route.content;
      console.log(`loading file "${path}"`);
      const useBlobCache = route.blobCache === true || this.blobCache;
      this.navigateFile(server, request, response, path, useBlobCache);
    } else if(route.handler === 'module'){
      const mod = this.apiRoot + '/' + route.module;
      console.log(`loading module "${mod}" to run "${route.function}"`);
      this.navigateModule(server, request, response, mod, route.function);
    }
  }

  selectRoute(path){
    let tokens = {};
    const match = {
      catchall: route => { 
        let isMatch = ( route.path === '*' || path.startsWith(route.startsWith))
        if(isMatch) {
          if(route.content !== undefined){
            if(route.content.indexOf('*') > -1){
              tokens.content = route.content.replace('*', path.substr(route.startsWith.length));
            } else {
              tokens.content = route.content;
            }
          } else {
            tokens.content = path;
          }
        }
        return isMatch;
      },
      replace: route => {
        const pathParts = path.split('/');
        if(pathParts.length !== route.parts.length) return false;
        tokens = {};
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
        return isMatch;
      },
      exact: route => { return route.path === path; }
    }
    const matchSelector = route => {
      return match[route.match] === undefined ? false : match[route.match](route);
    }
    let route = this.routes.find(matchSelector);
    if(route !== undefined) return Object.assign({}, route, tokens);
  }

  navigateFile(server, request, response, path, useBlobCache){
    if(path == null){
      response.writeHead(404, {'Content-Type': 'text/html'});
      response.end();
      return;
    }

    const onLoaded = function (err, data) {
      if (err) {
        console.log(err);
        response.writeHead(404, {'Content-Type': 'text/html'});
      } else {
        response.writeHead(200, {'Content-Type': contentType.get(path)});
        response.write(data);
      }
      response.end();
    };
    this.loader.get(path, onLoaded, useBlobCache);
  }

  navigateModule(server, request, response, modPath, func){
    const normalized = path.resolve(modPath);
    try{
      const mod = require(normalized);
      if(mod !== undefined && mod[func] !== undefined){
        const content = mod[func](server, request, response);
        if(content != null) response.write(content);
      }
    } catch(e){
      // TODO: Handle e
    }
    response.end();
  }
}
