#!/usr/bin/env node
'use strict';
const Cesium = require('cesium');
const path = require('path');
const yargs = require('yargs');
const isTile = require('../lib/isTile');
const readTile = require('../lib/readTile');
const readTileset = require('../lib/readTileset');
const readTileFromArchive = require('../lib/readTileFromArchive');
const readTilesetFromArchive = require('../lib/readTilesetFromArchive');
const validateTile = require('../lib/validateTile');
const validateTileset = require('../lib/validateTileset');
const validateTileFromArchive = require('../lib/validateTileFromArchive');
const validateTilesetFromArchive = require('../lib/validateTilesetFromArchive');
const util = require('../lib/utility');
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
var innerPath = util.normalizePath(argv.innerPath);
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

