'use strict';
module.exports = readTilesetFromArchive;

/**
 * Reads the tileset JSON from a file.
 *
 * @param {String} filePath The file path.
 * @returns {Promise} A promise that resolves with a JSON object of the tileset.
 */
function readTilesetFromArchive(archive, filePath) {
  try {
    const buffer = archive.entryDataSync(filePath);
    return Promise.resolve(JSON.parse(buffer.toString()));
  }
  catch (err) {
    return Promise.reject(err);
  }
}
