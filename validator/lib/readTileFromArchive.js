'use strict';
module.exports = readTileFromArchive;

/**
 * Reads the tile from a file.
 *
 * @param {String} filePath The file path.
 * @returns {Promise} A promise that resolves with a Buffer object.
 */
function readTileFromArchive(archive, filePath) {
  try {
    const buffer = archive.entryDataSync(filePath);
    return Promise.resolve(buffer);  
  }
  catch (err) {
    return Promise.reject(err);
  }
}
