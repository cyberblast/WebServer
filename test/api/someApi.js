module.exports = {
  do: function (srv, req, res){
    return 'API works!';
  },
  echo: function (srv, req, res, args){
    return args ? JSON.stringify(args) : 'null';
  }
}
