'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');
var zlib = require('zlib');
var getDefaultWriteCallback = require('./getDefaultWriteCallback');
var isGzipped = require('./isGzipped');
var isTile = require('./isTile');
var walkDirectory = require('./walkDirectory');
var bufferToJson = require('./bufferToJson');

var Check = Cesium.Check;
var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports = printTilesetInfo;

/**
 * Print information about the given tileset
 *
 * @param {Buffer} content The file contents
 * @param {String} inputPath The tileset.json file path
 *
 * @returns {Promise} A promise that resolves when the operation completes.
 */
function printTilesetInfo(content, inputPath) {
  //console.log(`Gathering information about ${inputPath}`);

  var tileset = bufferToJson(content);

  var root = tileset.root;
  
  return gatherTileInfo(root, inputPath, true)
    .then(infos => {
      console.log(infos);
      if (Array.isArray(infos)) {
        console.log(`Collected ${infos.length} tilesets`);
        let totalNumTiles = 0;
        for (let i = 0; i < infos.length; i++) {
          let info = infos[i];
          printInfo(tileset, info);
          totalNumTiles += info.numTiles;
        }

        console.log(`Total number of tiles: ${totalNumTiles}`);
      } else {
        console.log(`Collected info for a single tileset`);
        printInfo(tileset, infos);
      }
    });
}

function gatherTileInfo(root, filePath, recurse) {
  var info = {
    "path": filePath,
    "json": [],
    "b3dm": [],
    "i3dm": [],
    "cmpt": [],
    "vctr": [],
    "numTiles": 0
  };

  var promises = [];
  var tiles = [root];
  while(tiles.length > 0) {
    var tile = tiles.pop();
    //console.log(`tile uri: ${tile.content.uri} children.length: ${tile.children ? tile.children.length : 0}`);

    if (tile.content !== undefined && tile.content.uri !== undefined) {
      let type = tile.content.uri.split(".").pop();
      //console.log(`type: ${type}`);
      info.numTiles++;
      if (recurse) {
        if (type == "json") {
          let subfilePath = path.join(path.dirname(filePath), tile.content.uri);
          //console.log(`Gathering info for ${subfilePath}`);
          promises.push(fsExtra.readFile(subfilePath)
            .then(function (content) {
              let tileset = bufferToJson(content);
              return gatherTileInfo(tileset.root, subfilePath, recurse)
                .then(res => res);
            }));
        }
      }

      info[type].push(path.join(path.dirname(filePath), tile.content.uri));
    }

    if (tile.children && tile.children.length > 0) {
      tiles.push(...tile.children);
    }
  }

  if (promises.length == 0) {
    return Promise.resolve(info);
  }
  
  promises.push(Promise.resolve(info));

  return Promise.all(promises);
}

function printInfo(tileset, info) {
  //console.log(info);
  console.log(`Path:  ${info.path}`);
  // console.log(`Tileset version: ${tileset.asset.version}`);
  //console.log(`Number of sub tilesets: ${info.json.length}`);
  //console.log(`Number of b3dm tiles: ${info.b3dm.length}`);
  console.log(`Number of tiles: ${info.numTiles}`);
  //info.b3dm.forEach(uri => {
  //  console.log(`b3dm uri: ${uri}`);
  //});

  //info.json.forEach(item => {
  //  console.log(`tileset path: ${item.path}`);
  //  item.promise
  //    .then(info => printInfo(item.tileset, info));
  //});        

}