#!/usr/bin/env node
'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var GltfPipeline = require('gltf-pipeline');
var path = require('path');
var Promise = require('bluebird');
var yargs = require('yargs');
var zlib = require('zlib');
var databaseToTileset = require('../lib/databaseToTileset');
var directoryExists = require('../lib/directoryExists');
var extractB3dm = require('../lib/extractB3dm');
var extractCmpt = require('../lib/extractCmpt');
var extractI3dm = require('../lib/extractI3dm');
var extractPnts = require('../lib/extractPnts');
var printGlbInfo = require('../lib/printGlbInfo');
var printTilesetInfo = require('../lib/printTilesetInfo');
var printI3dmInfo = require('../lib/printI3dmInfo');
var printPntsInfo = require('../lib/printPntsInfo');
var fileExists = require('../lib/fileExists');
var getBufferPadded = require('../lib/getBufferPadded');
var getMagic = require('../lib/getMagic');
var getJsonBufferPadded = require('../lib/getJsonBufferPadded');
var glbToB3dm = require('../lib/glbToB3dm');
var glbToI3dm = require('../lib/glbToI3dm');
var isGzipped = require('../lib/isGzipped');
var optimizeGlb = require('../lib/optimizeGlb');
var runPipeline = require('../lib/runPipeline');
var tilesetToDatabase = require('../lib/tilesetToDatabase');
const StreamZip = require('node-stream-zip');

var zlibGunzip = Promise.promisify(zlib.gunzip);
var zlibGzip = Promise.promisify(zlib.gzip);

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;
var DeveloperError = Cesium.DeveloperError;

var index = -1;
for (var i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--options') {
        index = i;
        break;
    }
}

var args;
var optionArgs;
if (index < 0) {
    args = process.argv.slice(2);
    optionArgs = [];
} else {
    args = process.argv.slice(2, index);
    optionArgs = process.argv.slice(index + 1);
}

// Specify input for argument parsing even though it won't be used
optionArgs.push('-i');
optionArgs.push('null');

var argv = yargs
    .usage('Usage: $0 <command> [options]')
    .help('h')
    .alias('h', 'help')
    .options({
        'i': {
            alias: 'input',
            description: 'Input path for the command.',
            global: true,
            normalize: true,
            type: 'string'
        },
        'o': {
            alias: 'output',
            description: 'Output path for the command.',
            global: true,
            normalize: true,
            type: 'string'
        },
        'f': {
            alias: 'force',
            default: false,
            description: 'Output can be overwritten if it already exists.',
            global: true,
            type: 'boolean'
        }
    })
    .command('pipeline', 'Execute the input pipeline JSON file.')
    .command('tilesetToDatabase', 'Create a sqlite database for a tileset.')
    .command('databaseToTileset', 'Unpack a tileset database to a tileset folder.')
    .command('glbToB3dm', 'Repackage the input glb as a b3dm with a basic header.')
    .command('glbToI3dm', 'Repackage the input glb as a i3dm with a basic header.')
    .command('b3dmToGlb', 'Extract the binary glTF asset from the input b3dm.')
    .command('i3dmToGlb', 'Extract the binary glTF asset from the input i3dm.')
    .command('cmptToGlb', 'Extract the binary glTF assets from the input cmpt.')
    .command('cmptToTiles', 'Split the input cmpt into multiple tiles.')
    .command('optimizeB3dm', 'Pass the input b3dm through gltf-pipeline. To pass options to gltf-pipeline, place them after --options. (--options -h for gltf-pipeline help)', {
        'options': {
            description: 'All arguments after this flag will be passed to gltf-pipeline as command line options.'
        }
    })
    .command('optimizeI3dm', 'Pass the input i3dm through gltf-pipeline. To pass options to gltf-pipeline, place them after --options. (--options -h for gltf-pipeline help)', {
        'options': {
            description: 'All arguments after this flag will be passed to gltf-pipeline as command line options.'
        }
    })
    .command('gzip', 'Gzips the input tileset directory.', {
        't': {
            alias: 'tilesOnly',
            default: false,
            description: 'Only tile files (.b3dm, .i3dm, .pnts, .vctr) should be gzipped.',
            type: 'boolean'
        }
    })
    .command('ungzip', 'Ungzips the input tileset directory.')
    .command('combine', 'Combines all external tilesets into a single tileset.json file.', {
        'r': {
            alias: 'rootJson',
            default: 'tileset.json',
            description: 'Relative path to the root tileset.json file.',
            normalize: true,
            type: 'string'
        }
    })
    .command('upgrade', 'Upgrades the input tileset to the latest version of the 3D Tiles spec. Embedded glTF models will be upgraded to glTF 2.0.')
    .command('info', 'Prints information about a tileset or tile.', {
        'p': {
            alias: 'pretty',
            default: false,
            description: 'Pretty-print glTF json part.',
            type: 'boolean'
        },
        's': {
            alias: 'archiveInternalPath',
            default: 'tileset.json',
            description: 'Path inside the zip archive',
            normalize: true,
            type: 'string'
        },
        'l': {
            alias: 'listArchive',
            default: false,
            description: 'List files in zip archive',
            type: 'boolean'
        }
    })
    .demand(1)
    .recommendCommands()
    .strict()
    .parse(args);

var command = argv._[0];
var input = defaultValue(argv.i, argv._[1]);
var output = defaultValue(argv.o, argv._[2]);
var force = argv.f;

if (!defined(input)) {
    console.log('-i or --input argument is required. See --help for details.');
    return;
}

console.time('Total');
runCommand(command, input, output, force, argv)
    .then(function() {
        console.timeEnd('Total');
    })
    .catch(function(error) {
        console.log(error.message);
    });

function runCommand(command, input, output, force, argv) {
    if (command === 'pipeline') {
        return processPipeline(input, force);
    } else if (command === 'gzip') {
        return processStage(input, output, force, command, argv);
    } else if (command === 'ungzip') {
        return processStage(input, output, force, command, argv);
    } else if (command === 'combine') {
        return processStage(input, output, force, command, argv);
    } else if (command === 'upgrade') {
        return processStage(input, output, force, command, argv);
    } else if (command === 'b3dmToGlb') {
        return readB3dmWriteGlb(input, output, force);
    } else if (command === 'i3dmToGlb') {
        return readI3dmWriteGlb(input, output, force);
    } else if (command === 'cmptToGlb') {
        return readCmptWriteGlb(input, output, force);
    } else if (command === 'cmptToTiles') {
        return readCmptWriteTiles(input, output, force);
    } else if (command === 'glbToB3dm') {
        return readGlbWriteB3dm(input, output, force);
    } else if (command === 'glbToI3dm') {
        return readGlbWriteI3dm(input, output, force);
    } else if (command === 'optimizeB3dm') {
        return readAndOptimizeB3dm(input, output, force, optionArgs);
    } else if (command === 'optimizeI3dm') {
        return readAndOptimizeI3dm(input, output, force, optionArgs);
    } else if (command === 'tilesetToDatabase') {
        return convertTilesetToDatabase(input, output, force);
    } else if (command === 'databaseToTileset') {
        return convertDatabaseToTileset(input, output, force);
    } else if (command === 'info') {
        return info(input, argv);
    }
    throw new DeveloperError('Invalid command: ' + command);
}

function checkDirectoryOverwritable(directory, force) {
    if (force) {
        return Promise.resolve();
    }
    return directoryExists(directory)
        .then(function(exists) {
            if (exists) {
                throw new DeveloperError('Directory ' + directory + ' already exists. Specify -f or --force to overwrite existing files.');
            }
        });
}

function checkFileOverwritable(file, force) {
    if (force) {
        return Promise.resolve();
    }
    return fileExists(file)
        .then(function (exists) {
            if (exists) {
                throw new DeveloperError('File ' + file + ' already exists. Specify -f or --force to overwrite existing files.');
            }
        });
}

function readFile(file) {
    return fsExtra.readFile(file)
        .then(function(fileBuffer) {
            if (isGzipped(fileBuffer)) {
                return zlibGunzip(fileBuffer);
            }
            return fileBuffer;
        });
}

function logCallback(message) {
    console.log(message);
}

function processPipeline(inputFile) {
    return fsExtra.readJson(inputFile)
        .then(function(pipeline) {
            var inputDirectory = pipeline.input;
            var outputDirectory = pipeline.output;

            if (!defined(inputDirectory)) {
                throw new DeveloperError('pipeline.input is required.');
            }

            outputDirectory = path.normalize(defaultValue(outputDirectory, path.join(path.dirname(inputDirectory), path.basename(inputDirectory) + '-processed')));

            // Make input and output relative to the root directory
            inputDirectory = path.join(path.dirname(inputFile), inputDirectory);
            outputDirectory = path.join(path.dirname(inputFile), outputDirectory);

            return checkDirectoryOverwritable(outputDirectory, force)
                .then(function() {
                    pipeline.input = inputDirectory;
                    pipeline.output = outputDirectory;

                    var options = {
                        logCallback : logCallback
                    };

                    return runPipeline(pipeline, options);
                });
        });
}

function processStage(inputDirectory, outputDirectory, force, command, argv) {
    outputDirectory = defaultValue(outputDirectory, path.join(path.dirname(inputDirectory), path.basename(inputDirectory) + '-processed'));
    return checkDirectoryOverwritable(outputDirectory, force)
        .then(function() {
            var stage = getStage(command, argv);

            var pipeline = {
                input : inputDirectory,
                output : outputDirectory,
                stages : [stage]
            };

            var options = {
                logCallback : logCallback
            };

            return runPipeline(pipeline, options);
        });
}

function getStage(stageName, argv) {
    var stage = {
        name : stageName
    };
    switch (stageName) {
        case 'gzip':
            stage.tilesOnly = argv.tilesOnly;
            break;
        case 'combine':
            stage.rootJson = argv.rootJson;
    }
    return stage;
}

function convertTilesetToDatabase(inputDirectory, outputPath, force) {
    outputPath = defaultValue(outputPath, path.join(path.dirname(inputDirectory), path.basename(inputDirectory) + '.3dtiles'));
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return tilesetToDatabase(inputDirectory, outputPath);
        });
}

function convertDatabaseToTileset(inputPath, outputDirectory, force) {
    outputDirectory = defaultValue(outputDirectory, path.join(path.dirname(inputPath), path.basename(inputPath, path.extname(inputPath))));
    return checkDirectoryOverwritable(outputDirectory, force)
        .then(function() {
            return databaseToTileset(inputPath, outputDirectory);
        });
}

function readGlbWriteB3dm(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 3) + 'b3dm');
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return readFile(inputPath)
                .then(function(glb) {
                    // Set b3dm spec requirements
                    var featureTableJson = {
                        BATCH_LENGTH : 0
                    };
                    return fsExtra.outputFile(outputPath, glbToB3dm(glb, featureTableJson));
                });
        });
}

function readGlbWriteI3dm(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 3) + 'i3dm');
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return readFile(inputPath)
                .then(function(glb) {
                    // Set i3dm spec requirements
                    var featureTable = {
                        INSTANCES_LENGTH : 1,
                        POSITION : {
                            byteOffset : 0
                        }
                    };
                    var featureTableJsonBuffer = getJsonBufferPadded(featureTable);
                    var featureTableBinaryBuffer = getBufferPadded(Buffer.alloc(12, 0)); // [0, 0, 0]

                    return fsExtra.outputFile(outputPath, glbToI3dm(glb, featureTableJsonBuffer, featureTableBinaryBuffer));
                });
        });
}

function readB3dmWriteGlb(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 4) + 'glb');
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return readFile(inputPath);
        })
        .then(function(b3dm) {
            return fsExtra.outputFile(outputPath, extractB3dm(b3dm).glb);
        });
}

function readI3dmWriteGlb(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 4) + 'glb');
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return readFile(inputPath);
        })
        .then(function(i3dm) {
            return fsExtra.outputFile(outputPath, extractI3dm(i3dm).glb);
        });
}

function zipReader(stream) {
    var bufs = [];
    stream.on('data', function (d) { bufs.push(d); });
    stream.on('end', function () {
        var buf = Buffer.concat(bufs);
        return Promise.resolve(buf);
    });
    stream.on('error', (err) => {
        return Promise.reject(err);
    });
}

function printInfoSync(zip, zipFilePath, content, innerPath, argv)
{
    let extension = path.extname(innerPath);
    if (extension == '.json') {
        return printTilesetInfo(content, innerPath, zip, zipFilePath);
    } else if (extension == '.b3dm') {
        let b3dm = extractB3dm(content);
        console.log(b3dm);
        return printGlbInfo(b3dm.glb, argv.pretty);
    } else if (extension == '.i3dm') {
        let i3dm = extractI3dm(content, innerPath);
        return printI3dmInfo(i3dm, argv);
    } else if (extension === ".pnts") {
        let pnts = extractPnts(content);
        return printPntsInfo(pnts);
    } else if (extension == '.cmpt') {
        let tiles = extractCmpt(content);
        for (let i = 0; i < tiles.length; i++) {
            console.log(`Cmpt ${i + 1} of ${tiles.length}:`);
            let i3dm = extractI3dm(tiles[i], innerPath);
            printI3dmInfo(i3dm, argv);
        }
        return;
    } else {
        console.warn(`Warning: unhandled file type: ${innerPath}`);
        console.log(content.toString());
    }
}

function info(inputPath, argv) {
    let extension = path.extname(inputPath);
    let inputFile = inputPath;
    if (extension == '.zip') {
        let zip = new StreamZip({
            file: inputPath,
            storeEntries: true
        });
        let innerPath = argv.archiveInternalPath;
        zip.on('error', (err) => {
            console.log(`Error: ${err}`);
        })
        zip.on('ready', () => {
            if (argv.listArchive) {
                console.log(`Archive contains ${zip.entriesCount} entries.`);
                for (const entry of Object.values(zip.entries())) {
                    const desc = entry.isDirectory ? 'directory' : `${entry.size} bytes`;
                    console.log(`${entry.name}: ${desc}`);
                }
            } else {
                let contents = zip.entryDataSync(innerPath);
                printInfoSync(zip, inputPath, contents, innerPath, argv);
            }
            zip.close();
        });
        return Promise.resolve();
    }
    else
        return readFile(inputFile)
            .then(content => {
                printInfoSync(undefined, undefined, content, inputFile, argv);
            });
}

function extractGlbs(tiles) {
    var glbs = [];
    var tilesLength = tiles.length;
    for (var i = 0; i < tilesLength; ++i) {
        var tile = tiles[i];
        var magic = getMagic(tile);
        if (magic === 'i3dm') {
            glbs.push(extractI3dm(tile).glb);
        } else if (magic === 'b3dm') {
            glbs.push(extractB3dm(tile).glb);
        }
    }
    return glbs;
}

function readCmptWriteGlb(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath).slice(0, inputPath.length - 5);
    return readFile(inputPath)
        .then(function(cmpt) {
            var tiles = extractCmpt(cmpt);
            var glbs = extractGlbs(tiles);
            var glbsLength = glbs.length;
            var glbPaths = new Array(glbsLength);
            if (glbsLength === 0) {
                throw new DeveloperError('No glbs found in ' + inputPath + '.');
            } else if (glbsLength === 1) {
                glbPaths[0] = outputPath + '.glb';
            } else {
                for (var i = 0; i < glbsLength; ++i) {
                    glbPaths[i] = outputPath + '_' + i + '.glb';
                }
            }
            return Promise.map(glbPaths, function(glbPath) {
                return checkFileOverwritable(glbPath, force);
            }).then(function() {
                return Promise.map(glbPaths, function(glbPath, index) {
                    return fsExtra.outputFile(glbPath, glbs[index]);
                });
            });
        });
}

function readCmptWriteTiles(inputPath, outputPath, force) {
    outputPath = defaultValue(outputPath, inputPath).slice(0, inputPath.length - 5);
    return readFile(inputPath)
        .then(function(cmpt) {
            var tiles = extractCmpt(cmpt);
            var tilePaths = new Array(tiles.length);
            if (tiles.length === 0) {
                throw new DeveloperError('No tiles found in ' + inputPath + '.');
            } else if (tiles.length === 1) {
                var magic = getMagic(tiles[0]);
                tilePaths[0] = outputPath + '.' + magic;
            } else {
                for (var i = 0; i < tiles.length; ++i) {
                    var magic = getMagic(tiles[i]);
                    tilePaths[i] = outputPath + '_' + i + '.' + magic;
                }
            }
            return Promise.map(tilePaths, function(tilePath) {
                return checkFileOverwritable(tilePath, force);
            }).then(function() {
                return Promise.map(tilePaths, function(tilePath, index) {
                    return fsExtra.outputFile(tilePath, tiles[index]);
                });
            });
        });
}

function readAndOptimizeB3dm(inputPath, outputPath, force, optionArgs) {
    var options = GltfPipeline.parseArguments(optionArgs);
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 5) + '-optimized.b3dm');
    var gzipped;
    var b3dm;
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return fsExtra.readFile(inputPath);
        })
        .then(function(fileBuffer) {
            gzipped = isGzipped(fileBuffer);
            if (isGzipped(fileBuffer)) {
                return zlibGunzip(fileBuffer);
            }
            return fileBuffer;
        })
        .then(function(fileBuffer) {
            b3dm = extractB3dm(fileBuffer);
            return optimizeGlb(b3dm.glb, options);
        })
        .then(function(glbBuffer) {
            var b3dmBuffer = glbToB3dm(glbBuffer, b3dm.featureTable.json, b3dm.featureTable.binary, b3dm.batchTable.json, b3dm.batchTable.binary);
            if (gzipped) {
                return zlibGzip(b3dmBuffer);
            }
            return b3dmBuffer;
        })
        .then(function(buffer) {
            return fsExtra.outputFile(outputPath, buffer);
        });
}

function readAndOptimizeI3dm(inputPath, outputPath, force, optionArgs) {
    var options = GltfPipeline.parseArguments(optionArgs);
    outputPath = defaultValue(outputPath, inputPath.slice(0, inputPath.length - 5) + '-optimized.i3dm');
    var gzipped;
    var i3dm;
    return checkFileOverwritable(outputPath, force)
        .then(function() {
            return fsExtra.readFile(inputPath);
        })
        .then(function(fileBuffer) {
            gzipped = isGzipped(fileBuffer);
            if (isGzipped(fileBuffer)) {
                return zlibGunzip(fileBuffer);
            }
            return fileBuffer;
        })
        .then(function(fileBuffer) {
            i3dm = extractI3dm(fileBuffer);
            return optimizeGlb(i3dm.glb, options);
        })
        .then(function(glbBuffer) {
            var i3dmBuffer = glbToI3dm(glbBuffer, i3dm.featureTable.json, i3dm.featureTable.binary, i3dm.batchTable.json, i3dm.batchTable.binary);
            if (gzipped) {
                return zlibGzip(i3dmBuffer);
            }
            return i3dmBuffer;
        })
        .then(function(buffer) {
            return fsExtra.outputFile(outputPath, buffer);
        });
}
