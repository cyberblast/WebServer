# cyberblast web server

A minimal node-based web server

[![Build Status](https://travis-ci.com/cyberblast/WebServer.svg?branch=dev)](https://travis-ci.com/cyberblast/webserver)
[![npm version](https://badge.fury.io/js/%40cyberblast%2Fwebserver.svg)](https://badge.fury.io/js/%40cyberblast%2Fwebserver)

## Implemented Features

* GET static files  
  like html markup, stylesheets, images etc...
* GET content from js functions  
  Call a static function in a js file / node module on the server. 
* POST to js functions  
  Just like GET but with added payload...
* Define access routes  
  Allows to map request urls to local paths, for static files and function calls alike.
* Simple blob cache  
  Keep once loaded files in memory
* Set static response headers  
  To include with every response

## Installation

`npm i @cyberblast/webserver`

## Usage

Create server
```js
const WebServer = require('@cyberblast/webserver');
const server = new WebServer('./config/webserver.json', './config/log.json');
```
Start server
```js
await server.start();
// or without async:
server.start().then(() => {
  // up and running...
});
```
Route requests to custom api handlers (see configuration section for routing details)
```js
// this is a sample custom api handler:
static greetIp(serverContext){
  return 'Hello ' + serverContext.request.socket.remoteAddress.split(':').pop();
}
```
Respond with a standardized error page
```js
// another a sample custom api handler:
static alwaysBroken(serverContext){
  serverContext.server.respondError(
    'Explicit developer error message', 
    serverContext, 
    500, // optional
    'Public message' // optional
  );
}
```
Stop server
```js
server.stop();
```
More examples can be found in the './test' directory of the repository.

## Configuration

Create a config file named `webserver.json` at your project root directory. 

Alternatively, you can create a json config file anywhere and specify its path/name when constructing the server: `new WebServer('./src/server/config.json')`

You can also specify logging settings in a separate log config file, by default expected to be at your project root directory at `log.json`, or specify a different path as a second parameter for WebServer construction like that: `new WebServer('./config/webserver.json', './config/log.json');`.  
More details about the logger can be found in [a separate repository](https://github.com/cyberblast/logger).

### Configuration Settings

Sample webserver.json file
```json
{
  "server": {
    "port": 80, 
    "blobCache": true,
    "headers": {
      "Server": "cyberblast"
    }
  },
  "router": {
    "fileRoot": "./static",
    "apiRoot": "./api",
    "modulesRoot": "./webmodule",
    "routes": [
      { "path": "/", "handler": "file", "content": "/index.html" },
      { "path": "/api/server/ip", "handler": "api", "module": "server.js", "function": "ip" },
      { "path": "/api/:module/:function", "handler": "api"},
      { "path": "/other/*", "handler": "file", "content": "/subFolder/*" },
      { "path": "*", "handler": "file", "blobCache": false}
    ]
  }
}
```
* server.port: Port for the webserver to listen at
* server.blobCache: Activate blob caching for all file routes (may be overridden on a per route base).
* server.headers: A dictionary of static response headers to include with every response.
* router.fileRoot: A base path for ALL file routes (optional)
* router.apiRoot: A base path for ALL js files (except files under *modulesRoot*), callable as api function (optional)
* router.modulesRoot: A root path for webmodule directories/packages. Such modules need to fit a certain pattern to work properly. See section *[webmodules](#webmodules)* for more details.
* router.routes: List of route rules. First path match will get executed (top to bottom).
* router.routes[x].path: URL path. Request url path must match to activate route rule. Filehandler rules may contain an asterisk (*) at the end to specify catch all rules. Apihandler rules may define token placeholders for module (:module) and function (:function). 
* router.routes[x].handler: "file" or "api". 
  * file: A rule to access static file content
  * api: A rule to access a js function
* router.routes[x].content: Valid for filehandler rules only. Specify a specific file (or path for catch all rules) to load.
* router.routes[x].blobCache: Valid for filehandler rules only. Activate blob caching for all files loaded by this route rule.
* router.routes[x].module: Valid for apihandler rules only. Specify js file to load as module. 
* router.routes[x].function: Valid for apihandler rules only. Specify name of static function to call.

Sample log.json file: 
```json
{
  "rules": [
    {
      "name": "all",
      "console": true
    }
  ]
}
```
## Webmodules

Besides allowing to serve static files and server api functions separate from each other, sometimes it's much better to ship things grouped together. This allows to develop custom pluggable module extensions, containing of client and server side code alike. 

Every web module must be contained within a separate directory. Such module directory may contain: 
* api.js  
main entry for server side code (api interface)
* component.mjs  
client side script module
* additional files and directories

To make such modules work, a *modulesRoot* path must be configured, containing all module directories.  
Web modules will ignore all other configured routes, but can be addressed slightly different: 

* /$api/\<name of web module\>/\<name of static function\>  
to access functions within api.js  
*Following example utilizes a custom HTML component to render server response (not subject here)*
```html
<server-snippet src="/$api/myComp/getStuff"></server-snippet>
```
* /$component/\<name of web module\>  
to load component.js on client side
```html
<script type="module" src="/$component/myComp"></script>
```
A working example can be found in the [MaumauServer repository](https://github.com/cyberblast/MaumauServer), a project based upon this web server.

## Legal

Please take note of files [LICENSE](https://raw.githubusercontent.com/cyberblast/webserver/master/LICENSE) and [CONTRIBUTING](https://raw.githubusercontent.com/cyberblast/webserver/master/CONTRIBUTING).

This is an experimental piece of code. This is NOT a production ready web server. Use on your own risk.
