const fs = require("fs");
const events = require('events');

module.exports = class Config{
  #basePath;
  event = new events.EventEmitter();
  completed = 0;
  constructor(basePath = 'src/'){
    this.basePath = basePath;
    this.loadFile('game.json', config => {
      this.game = config;
      this.fileCompleted();
    });
    this.loadFile('router.json', config => {
      this.router = config;
      this.fileCompleted();
    });
  }
  fileCompleted(){
    this.completed++;
    if(this.completed === 2){
      this.event.emit('loaded');
    }
  }
  ready(callback){
    this.event.on('loaded', callback);
  }
  loadFile(path, complete){
    fs.readFile(this.basePath + path, function (err, data) {
      if (err) {
          console.log(err.stack);
          return;
      }
      complete(JSON.parse(data.toString()));
    });
  }
}
