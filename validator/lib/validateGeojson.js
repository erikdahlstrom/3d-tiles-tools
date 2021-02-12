'use strict';
const Cesium = require('cesium');
const path = require('path');
const fsExtra = require('fs-extra');
const bufferToJson = require('./bufferToJson');
const Ajv = require('ajv').default
const geojsonSchema = require('../schemas/GeoJSON/GeoJSON.json')

const defaultValue = Cesium.defaultValue;

module.exports = validateGeojson;

/**
 * Check if the GeoJSON is valid.
 *
 * @param {Object} options An object with the following properties:
 * @param {Buffer} options.content The gltf buffer.
 * @param {String} options.filePath The tile's file path.
 * @param {String} options.directory The tile's directory.
 * @param {Object} options.reader The file reader.
 * @param {Boolean} [options.writeReports=false] Write glTF error report next to the glTF file in question.
 * @returns {Promise} A promise that resolves when the validation completes. If the validation fails, the promise will resolve to an error message.
 */
async function validateGeojson(options) {
  const buffer = options.content;
  const filePath = options.filePath;
  const directory = options.directory;
  const reader = options.reader;
  const writeReports = defaultValue(options.writeReports, false);

  try {
    const parsedJson = bufferToJson(buffer);
    const ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
    const validate = ajv.compile(geojsonSchema)
    const valid = validate(parsedJson)
    if (!valid) {
      if (writeReports) {
        await fsExtra.writeFile(`${filePath}_report.json`, JSON.stringify(validate.errors, null, 2));
      }
      return `GeoJSON validation failed: ${JSON.stringify(validate.errors, null, 2)}`;
    }
  }
  catch(err) {
    return `GeoJSON validation failed: ${error.message}`;
  }
}
