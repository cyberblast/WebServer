const fs = require("fs");
const path = require('path');

module.exports = class BlobLoader {
  constructor(){
    this.cache = {};
  }

  clear(){
    delete this.cache;
    this.cache = {};
  }

  async get(filePath, useCache = true){
    const normalized = path.resolve(filePath);

    if(useCache && this.cache[normalized] !== undefined){
      return this.cache[normalized];
    }

    const file = await this.readFile(filePath);

    if(useCache) this.cache[normalized] = file;
    return file;
  }

  async readFile(filePath){
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, function (fsError, data) {
        if (fsError) {
          reject(fsError);
          return;
        }
        resolve(data);
      });
    });
  }
}
