#!/usr/bin/env node
'use strict';
var Cesium = require('cesium');
var path = require('path');
var yargs = require('yargs');
var isTile = require('../lib/isTile');
var readTile = require('../lib/readTile');
var readTileset = require('../lib/readTileset');
var readTileFromArchive = require('../lib/readTileFromArchive');
var readTilesetFromArchive = require('../lib/readTilesetFromArchive');
var validateTile = require('../lib/validateTile');
var validateTileset = require('../lib/validateTileset');
var validateTileFromArchive = require('../lib/validateTileFromArchive');
var validateTilesetFromArchive = require('../lib/validateTilesetFromArchive');
const StreamZip = require('node-stream-zip');

var defined = Cesium.defined;

var args = process.argv.slice(2);
global.argv = yargs
    .usage('Usage: node $0 -i <path>')
    .help('h')
    .alias('h', 'help')
    .options({
        'i': {
            alias: 'input',
            description: 'Input path for the tileset or tile.',
            normalize: true,
            demandOption: true,
            type: 'string'
        },
        's': {
            alias: 'innerPath',
            description: 'Path inside the zip archive',
            normalize: true,
            default: 'tileset.json',
            type: 'string'
        },
        'r': {
            alias: 'writeReports',
            description: 'Write glTF error reports next to the glTF file in question.',
            default: false,
            type: 'boolean'
        },
        'g': {
            alias: 'validateGlb',
            description: 'Validate GLB files with the glTF Validator.',
            default: true,
            type: 'boolean'
        }
    })
    .recommendCommands()
    .strict()
    .parse(args);

var promise;
var filePath = argv.input;
var innerPath = argv.innerPath;
var extension = path.extname(filePath);
if (extension === '') {
    filePath = path.join(filePath, 'tileset.json');
}

if (extension === '.zip' || extension === '.3tz') {
    const archive = new StreamZip({
        file: filePath,
        storeEntries: true
    });
    archive.on('error', (err) => {
        console.error(`Error: ${err}`);
    })
    archive.on('ready', () => {
        if (isTile(innerPath)) {
            promise = readTileFromArchive(archive, innerPath)
                .then(function(content) {
                    return validateTileFromArchive(content, innerPath, argv, archive, filePath);
                });
        } else {
            promise = readTilesetFromArchive(archive, innerPath)
                .then(function(tileset) {
                    return validateTilesetFromArchive(tileset, innerPath, path.dirname(innerPath), argv, archive, filePath);
                });
        }

        promise.then(function (message) {
            if (defined(message)) {
                console.log(message);
            } else {
                console.log(filePath + ' : ' + innerPath + ' is valid');
            }
        }).catch(function (error) {
            console.log('Could not read ' + error.message);
        }).finally(() => {
            archive.close();
            console.log("Closed archive.");
        });
    });
} else {
    if (isTile(filePath)) {
        promise = readTile(filePath)
            .then(function(content) {
                return validateTile(content, filePath, argv);
            });
    } else {
        promise = readTileset(filePath)
            .then(function(tileset) {
                return validateTileset(tileset, filePath, path.dirname(filePath), argv);
            });
    }

    promise.then(function(message) {
        if (defined(message)) {
            console.log(message);
        } else {
            console.log(filePath + ' is valid');
        }
    }).catch(function(error) {
        console.log('Could not read ' + error.message);
    });
}

