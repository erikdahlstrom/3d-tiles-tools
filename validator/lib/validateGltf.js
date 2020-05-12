'use strict';
var Cesium = require('cesium');
module.exports = validateGltf;
const path = require('path');
const os = require('os');
const fs = require('fs');
const validator = require('gltf-validator');
const bufferToJson = require('./bufferToJson');

var defined = Cesium.defined;

/**
 * Check if the gltf is valid.
 *
 * @param {Buffer} gltf The gltf buffer.
 * @returns {String} An error message if validation fails, otherwise undefined.
 */
async function validateGltf(buffer, filePath, archive, archivePath) {
    let gltf = bufferToJson(buffer);
    var version = gltf.asset.version;

    if (version !== "2.0") {
        return 'Invalid Gltf version: ' + version + '. Version must be 2.0';
    }

    return validator.validateBytes(buffer, {
        uri: filePath,
        externalResourceFunction: (uri) =>
            new Promise((resolve, reject) => {
                uri = path.join(path.dirname(filePath), decodeURIComponent(uri));
                console.debug(`Loading external file: ${archivePath ? archivePath + " : " : ""}${uri}`);
                if (defined(archive)) {
                    let buffer = archive.entryDataSync(uri);
                    resolve(buffer);
                } else {
                    fs.readFile(uri, (err, data) => {
                        if (err) {
                            console.error(err.toString());
                            reject(err.toString());
                            return;
                        }
                        resolve(data);
                    });
                }
            })
    }).then((result) => {
        // [result] will contain validation report in object form.
        // You can convert it to JSON to see its internal structure. 
        if (result.issues.numErrors > 0) {
            let validationText = JSON.stringify(result, null, '  ');
            if (argv.writeReports) {
                fs.writeFile(`${defined(archivePath) ? archivePath + '_' : ''}${filePath}_report.json`, validationText, (err) => {
                    if (err) { throw err; }
                });
            }
            return validationText;
        }
        return;
    }, (result) => {
        // Promise rejection means that arguments were invalid or validator was unable 
        // to detect file format (glTF or GLB). 
        // [result] will contain exception string.
        //console.error(result);
        return result;
    });
}
