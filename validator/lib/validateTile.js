'use strict';
const path = require('path');
const validateB3dm = require('../lib/validateB3dm');
const validateCmpt = require('../lib/validateCmpt');
const validateI3dm = require('../lib/validateI3dm');
const validatePnts = require('../lib/validatePnts');
const validateGlb = require('../lib/validateGlb');
const validateGltf = require('../lib/validateGltf');

module.exports = validateTile;

/**
 * Check if the tile's content is valid.
 *
 * @param {Buffer} content The tile's content.
 * @returns {String} An error message if validation fails, otherwise undefined.
 */
function validateTile(content, filePath, argv) {
    if (path.extname(filePath) === '.gltf') {
        return validateGltf(content, filePath);
    }
    if (content.length < 4) {
        return 'Cannot determine tile format from tile header, tile content is ' + content.length + ' bytes.';
    }
    var magic = content.toString('utf8', 0, 4);
    if (magic === 'glTF') {
        return validateGlb(content, filePath);
    } else if (magic === 'b3dm') {
        return validateB3dm(content, filePath, argv);
    } else if (magic === 'i3dm') {
        return validateI3dm(content, filePath, argv);
    } else if (magic === 'pnts') {
        return validatePnts(content, filePath, argv);
    } else if (magic === 'cmpt') {
        return validateCmpt(content, filePath, argv);
    }
    return 'Invalid magic: ' + magic;
}
