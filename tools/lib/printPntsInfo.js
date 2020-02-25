'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');

var Check = Cesium.Check;
var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports = printPntsInfo;

/**
 * Print information about the given pnts
 *
 * @param {Object} pnts The parsed pnts json
 *
 * @returns {Promise} A promise that resolves when the operation completes.
 */
function printPntsInfo(pnts) {
  console.log(pnts);

  if (pnts.featureTable.json.RTC_CENTER) {
      console.log(`rtcCenter: ${pnts.featureTable.json.RTC_CENTER}`);
  }

  const itemSizeBytes = 3 * 4;
  for (let i = 0; i < pnts.featureTable.json.POINTS_LENGTH; i++) {
    let offset = pnts.featureTable.json.POSITION.byteOffset + i * itemSizeBytes;
    let x = pnts.featureTable.binary.readFloatLE(offset);
    let y = pnts.featureTable.binary.readFloatLE(offset + 4);
    let z = pnts.featureTable.binary.readFloatLE(offset + 8);
    console.log(`[${i}] position: [${x}, ${y}, ${z}] (offset: ${offset})`);
    
    if (pnts.featureTable.json.RGB) {
        let offset = pnts.featureTable.json.RGB.byteOffset + i * 3;
        let r = pnts.featureTable.binary.readUInt8(offset);
        let g = pnts.featureTable.binary.readUInt8(offset + 1);
        let b = pnts.featureTable.binary.readUInt8(offset + 2);
        console.log(`[${i}] rgb: [${r}, ${g}, ${b}] (offset: ${offset})`);
    }
  }
}
