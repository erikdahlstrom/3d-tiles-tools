'use strict';

var Cesium = require('cesium');
var bufferToJson = require('./bufferToJson');
var getMagic = require('./getMagic');

var defined = Cesium.defined;
var DeveloperError = Cesium.DeveloperError;

module.exports = extractPnts;

/**
 * Extracts information and sections from an pnts buffer.
 *
 * @param {Buffer} buffer A buffer containing an pnts asset.
 * @returns {Object} An object containing the header and sections of the pnts asset.
 */
function extractPnts(buffer) {
    if (!defined(buffer)) {
        throw new DeveloperError('buffer is not defined.');
    }
    var magic = getMagic(buffer);
    if (magic !== 'pnts') {
        throw new DeveloperError('Invalid magic, expected "pnts", got: "' + magic + '".');
    }
    var version = buffer.readUInt32LE(4);
    if (version !== 1) {
        throw new DeveloperError('Invalid version, only "1" is valid, got: "' + version + '".');
    }

    var byteLength = buffer.readUInt32LE(8);
    var featureTableJsonByteLength = buffer.readUInt32LE(12);
    var featureTableBinaryByteLength = buffer.readUInt32LE(16);
    var batchTableJsonByteLength = buffer.readUInt32LE(20);
    var batchTableBinaryByteLength = buffer.readUInt32LE(24);

    var headerByteLength = 28;
    var featureTableJsonByteOffset = headerByteLength;
    var featureTableBinaryByteOffset = featureTableJsonByteOffset + featureTableJsonByteLength;
    var batchTableJsonByteOffset = featureTableBinaryByteOffset + featureTableBinaryByteLength;
    var batchTableBinaryByteOffset = batchTableJsonByteOffset + batchTableJsonByteLength;

    var featureTableJsonBuffer = buffer.slice(featureTableJsonByteOffset, featureTableBinaryByteOffset);
    var featureTableBinaryBuffer = buffer.slice(featureTableBinaryByteOffset, batchTableJsonByteOffset);
    var batchTableJsonBuffer = buffer.slice(batchTableJsonByteOffset, batchTableBinaryByteOffset);
    var batchTableBinaryBuffer = buffer.slice(batchTableBinaryByteOffset, batchTableBinaryByteOffset + batchTableBinaryByteLength);

    var featureTableJson = bufferToJson(featureTableJsonBuffer);
    var batchTableJson = bufferToJson(batchTableJsonBuffer);

    return {
        header : {
            magic : magic,
            version : version
        },
        featureTable : {
            json : featureTableJson,
            binary : featureTableBinaryBuffer
        },
        batchTable : {
            json : batchTableJson,
            binary : batchTableBinaryBuffer
        }
    };
}
