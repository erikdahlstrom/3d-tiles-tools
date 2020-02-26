'use strict';
var validateB3dm = require('../lib/validateB3dm');
var validateCmpt = require('../lib/validateCmpt');
var validateI3dm = require('../lib/validateI3dm');
var validatePnts = require('../lib/validatePnts');

module.exports = validateTileFromArchive;

/**
 * Check if the tile's content is valid.
 *
 * @param {Buffer} content The tile's content.
 * @returns {String} An error message if validation fails, otherwise undefined.
 */
function validateTileFromArchive(content, filePath, argv, archive, archivePath) {
    console.log(`Validating tile ${archivePath} : ${filePath}`);
    if (content.length < 4) {
        return 'Cannot determine tile format from tile header, tile content is ' + content.length + ' bytes.';
    }
    var magic = content.toString('utf8', 0, 4);
    if (magic === 'b3dm') {
        return validateB3dm(content, filePath, argv, archive, archivePath);
    } else if (magic === 'i3dm') {
        return validateI3dm(content, filePath, argv, archive, archivePath);
    } else if (magic === 'pnts') {
        return validatePnts(content, filePath, argv, archive, archivePath);
    } else if (magic === 'cmpt') {
        return validateCmpt(content, filePath, argv, archive, archivePath);
    }
    return 'Invalid magic: ' + magic;
}
