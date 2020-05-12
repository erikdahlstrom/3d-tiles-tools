'use strict';
var path = require('path');
var Cesium = require('cesium');
var defined = Cesium.defined;

module.exports = isTile;

/**
 * Checks whether the given file path is a tile file path.
 *
 * @param {String} filePath The file path.
 * @param {String} version The tileset version
 * @returns {Boolean} True if the file path is a tile file path, false if not.
 */
function isTile(filePath, version) {
    var extension = path.extname(filePath);
    if (defined(version)) {
        return 
        (version === '2.0.0-alpha.0' && 
            (extension === '.gltf' ||
            extension === '.glb')) || 
        (version === '1.0' && 
            (extension === '.b3dm' ||
            extension === '.i3dm' ||
            extension === '.pnts' ||
            extension === '.cmpt'));
    }
    
    let res =
        extension === '.gltf' ||
        extension === '.glb' || 
        extension === '.b3dm' ||
        extension === '.i3dm' ||
        extension === '.pnts' ||
        extension === '.cmpt';
    return res;
}
