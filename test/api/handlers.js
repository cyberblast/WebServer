module.exports = {
  test: function(serverContext){
    return 'API works!';
  },
  greetIp: function(serverContext){
    return 'Hello' + serverContext.request.socket.remoteAddress.split(':').pop();
  },
  echoPost: function (serverContext){
    return JSON.stringify(serverContext.data);
  },
  alwaysBroken: function(serverContext){
    serverContext.server.respondError(
      'Explicit developer error message', 
      serverContext, 
      500, // opional
      'Public message' // optional
    );
  }
}
