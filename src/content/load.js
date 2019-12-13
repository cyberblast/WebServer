const fs = require("fs");
const path = require('path');

const cache = {};

module.exports = async function(filePath) {
  return new Promise((resolve, reject) => {
    const normalized = path.join(__dirname, filePath);
    if (cache[normalized] === undefined) {
      fs.readFile(normalized, function(fsError, data) {
        if (fsError) {
          reject(fsError);
          return;
        }
        cache[normalized] = data;
        resolve(cache[normalized]);
      });
    } else {
      resolve(cache[normalized]);
    }
  });
};
