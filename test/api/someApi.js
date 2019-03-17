module.exports = {
  do: function (srv, req, res){
    res.writeHead(200);	
    res.write('API works!');
    res.end();
  }
}