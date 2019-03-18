let mod = {};
module.exports = mod;

const fs = require("fs");

function loadFile(path, complete, error){
  fs.readFile(path, function (fsE, data) {
    if (fsE) { 
      // TODO: Log hint to create config file
      // TODO: load default settings
      error(fsE);
      return;
    }
    let file;
    try{
      file = JSON.parse(data.toString());
    } catch(e){
      error(e);
      return;
    }
    complete(file);
  });
};

mod.load = function(onError, onSuccess, config = 'webserver.json', forceReload = false){
  if(forceReload && mod.settings !== undefined){
    delete mod.settings;
  }
  if(mod.settings === undefined){
    loadFile(config, file => {
      //Object.assign(mod, file);
      mod.settings = file;
      onSuccess(file);
    }, 
    onError);
  } else {
    onSuccess(mod.settings);
  }
};
