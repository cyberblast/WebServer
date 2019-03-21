module.exports = class RequestContext {
  server; 
  client;
  request;
  response;
  route;
  data;
  constructor(server){
    this.server = server;
  }
}