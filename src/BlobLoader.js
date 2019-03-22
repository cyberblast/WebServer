const fs = require("fs");
const path = require('path');

module.exports = class BlobLoader {
  constructor(){
    this.cache = {};
  }

  get(filePath, callback, useCache = true){
    const normalized = path.resolve(filePath);
    if(useCache){
      if(this.cache[normalized] !== undefined){
        // console.log(`Reading file ${normalized} from blob cache`);
        callback(null, this.cache[normalized]);
        return;
      }
    }
    // console.log(`Reading file ${normalized} from file system`);
    const self = this;
    fs.readFile(normalized, function (err, data) {
      if (err) {
        callback(err, data);
      } else {
        if(useCache) {
          self.cache[normalized] = data;
        }
        callback(null, data);
      }
    });
  }

  clear(){
    delete this.cache;
    this.cache = {};
  }
}
