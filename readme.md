# cyberblast web server

A minimal node-based web server

[![GitHub version](https://badge.fury.io/gh/cyberblast%2FWebServer.svg)](https://badge.fury.io/gh/cyberblast%2FWebServer)
[![npm version](https://badge.fury.io/js/%40cyberblast%2Fwebserver.svg)](https://badge.fury.io/js/%40cyberblast%2Fwebserver)

## Implemented Features

* GET static files  
  like html markup, stylesheets, images etc...
* GET content from js functions  
  Call any static function in any module. 
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
const server = require('@cyberblast/webserver');
```
Attach error handler
```js
server.onError(err => { console.error(err); });
```
Start server
```js
server.start();
```
Route requests to custom js handlers
```js
static greetIp(serverContext){
  return 'Hello' + serverContext.request.socket.remoteAddress.split(':').pop();
}
```
Respond with a standardized error page
```js
static alwaysBroken(serverContext){
  serverContext.server.respondError(
    'Explicit developer error message', 
    serverContext.response, 
    500, // opional
    'Public message' // optional
  );
}
```
Stop server
```js
server.stop();
```
More examples can be found in the './test' directory

## Configuration

Create a config file named `webserver.json` at your project root directory. 

Alternatively, you can create a json config file anywhere and specify its path/name when starting the server: `server.start('./src/server/config.json')`

### Configuration Settings

Sample webserver.json file
```json
{
  "server": {
    "port": 80, 
    "blobCache": true
  },
  "router": {
    "fileRoot": "./test/webRoot",
    "apiRoot": "./test/api",
    "routes": [
      { "path": "/", "handler": "file", "content": "/index.html" },
      { "path": "/api/server/ip", "handler": "module", "module": "server.js", "function": "ip" },
      { "path": "/api/:module/:function", "handler": "module"},
      { "path": "/other/*", "handler": "file", "content": "/subFolder/*" },
      { "path": "*", "handler": "file", "blobCache": false}
    ]
  }
}
```
* server.port: Port for the webserver to listen at
* server.blobCache: Activate blob caching for all file routes (may be overridden on a per route base).
* router.fileRoot: A base path for ALL file routes (optional)
* router.apiRoot: A base path for ALL js files, callable as api function (optional)
* router.routes: List of route rules. First path match will get executed (top to bottom).
* router.routes[x].path: URL path. Request url path must match to activate route rule. Filehandler rules may contain an asterisk (*) at the end to specify catch all rules. Modulehandler rules may define token placeholders for module (:module) and function (:function). 
* router.routes[x].handler: "file" or "module". 
  * file: A rule to access static file content
  * module: A rule to access a js function
* router.routes[x].content: Valid for filehandler rules only. Specify a specific file (or path for catch all rules) to load.
* router.routes[x].blobCache: Valid for filehandler rules only. Activate blob caching for all files loaded by this route rule.
* router.routes[x].module: Valid for modulehandler rules only. Specify js file to load as module. 
* router.routes[x].function: Valid for modulehandler rules only. Specify name of static function to call.

## Contribution & Collaboration

First, before deciding to contribute to this repository please read and accept LICENSE & CONTRIBUTING files.  
Any contribution requires and assumes full consent.

## Legal implications

This is an experimental piece of code. This is NOT a production ready web server. Use on your own risk.
