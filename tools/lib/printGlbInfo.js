'use strict';
var Cesium = require('cesium');
var defined = Cesium.defined;
var DeveloperError = Cesium.DeveloperError;
var getMagic = require('./getMagic');
var bufferToJson = require('./bufferToJson');

module.exports = printGlbInfo;

/**
 * Extracts information about a GLB.
 *
 * @param {Buffer} glbBuffer A buffer containing a glb.
 * @returns {Object} An object containing the header and sections of the b3dm asset.
 */
function printGlbInfo(glbBuffer, prettify) {
  if (!defined(glbBuffer)) {
    throw new DeveloperError('glbBuffer is not defined.');
  }

  var magic = getMagic(glbBuffer);
  if (magic !== 'glTF') {
      throw new DeveloperError('Invalid magic, expected "glTF", got: "' + magic + '".');
  }
  var version = glbBuffer.readUInt32LE(4);
  if (version !== 2) {
      throw new DeveloperError('Invalid version, only "2" is valid, got: "' + version + '".');
  }
  var length = glbBuffer.readUInt32LE(8);
  if (length < 20) {
      throw new DeveloperError('Invalid length: "' + length + '".');
  }

  var chunkLength = glbBuffer.readUInt32LE(12);
  if (chunkLength < 20) {
      throw new DeveloperError('Invalid chunk length: "' + length + '".');
  }
  var chunkType = getMagic(glbBuffer, 16);
  if (chunkType == 'JSON') {
    let offset = 20;
    let buffer = glbBuffer.slice(offset, offset + chunkLength);
    //console.log(buffer.toString());
    let json = bufferToJson(buffer);
    if (prettify) {
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log(buffer.toString());
    }
    return json;
  }

  return;
}