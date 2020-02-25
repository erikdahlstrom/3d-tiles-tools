'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');
var printGlbInfo = require('../lib/printGlbInfo');

var Check = Cesium.Check;
var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports = printI3dmInfo;

/**
 * Print information about the given i3dm
 *
 * @param {Object} i3dm The parsed i3dm json
 *
 * @returns {Promise} A promise that resolves when the operation completes.
 */
function printI3dmInfo(i3dm, argv) {
  console.log(i3dm);

  if (i3dm.featureTable.json.RTC_CENTER) {
    console.log(`rtcCenter: ${i3dm.featureTable.json.RTC_CENTER}`);
  }

  const itemSizeBytes = 3 * 4;
  for (let i = 0; i < i3dm.featureTable.json.INSTANCES_LENGTH; i++) {
    let offset = i3dm.featureTable.json.POSITION.byteOffset + i * itemSizeBytes;
    let x = i3dm.featureTable.binary.readFloatLE(offset);
    let y = i3dm.featureTable.binary.readFloatLE(offset + 4);
    let z = i3dm.featureTable.binary.readFloatLE(offset + 8);
    console.log(`[${i}] position: [${x}, ${y}, ${z}] (offset: ${offset})`);

    if (i3dm.featureTable.json.NORMAL_UP) {
      let offset = i3dm.featureTable.json.NORMAL_UP.byteOffset + i * itemSizeBytes;
      let x = i3dm.featureTable.binary.readFloatLE(offset);
      let y = i3dm.featureTable.binary.readFloatLE(offset + 4);
      let z = i3dm.featureTable.binary.readFloatLE(offset + 8);
      console.log(`[${i}] normal up: [${x}, ${y}, ${z}] (offset: ${offset})`);
    }

    if (i3dm.featureTable.json.NORMAL_RIGHT) {
      let offset = i3dm.featureTable.json.NORMAL_RIGHT.byteOffset + i * itemSizeBytes;
      let x = i3dm.featureTable.binary.readFloatLE(offset);
      let y = i3dm.featureTable.binary.readFloatLE(offset + 4);
      let z = i3dm.featureTable.binary.readFloatLE(offset + 8);
      console.log(`[${i}] normal right: [${x}, ${y}, ${z}] (offset: ${offset})`);
    }

    if (i3dm.featureTable.json.SCALE_NON_UNIFORM) {
      let offset = i3dm.featureTable.json.SCALE_NON_UNIFORM.byteOffset + i * itemSizeBytes;
      let x = i3dm.featureTable.binary.readFloatLE(offset);
      let y = i3dm.featureTable.binary.readFloatLE(offset + 4);
      let z = i3dm.featureTable.binary.readFloatLE(offset + 8);
      console.log(`[${i}] scaleNonUniform: [${x}, ${y}, ${z}] (offset: ${offset})`);
    }
  }

  if (typeof i3dm.glb === 'string') {
    return fsExtra.readFile(i3dm.glb)
      .then(content => {
        return printGlbInfo(content, argv.pretty);
      });
  }
  else
    return printGlbInfo(i3dm.glb, argv.pretty);
  
  //return i3dm.glb
  //  .then(function (glb) {
  //    printGlbInfo(glb, argv.pretty);
  //  });
}
