'use strict';
const Cesium = require('cesium');
const path = require('path');
const yargs = require('yargs');

const isTile = require('../lib/isTile');
const readTile = require('../lib/readTile');
const readTileset = require('../lib/readTileset');
const validateTile = require('../lib/validateTile');
const validateTileset = require('../lib/validateTileset');
const archive = require('../lib/archive');
const utility = require('../lib/utility');

const defined = Cesium.defined;

const args = process.argv;
const argv = yargs
    .usage('Usage: node $0 -i <path>')
    .example('node $0 -i tile.b3dm')
    .example('node $0 -i tileset.json')
    .help('h')
    .alias('h', 'help')
    .options({
        input: {
            alias: 'i',
            describe: 'Path to the tileset JSON or tile to validate.',
            normalize: true,
            demandOption: true,
            type: 'string'
        },
        innerPath: {
            alias: 's',
            describe: 'Path to the tileset JSON or tile to validate.',
            normalize: true,
            default: 'tileset.json',
            demandOption: false,
            type: 'string'
        },
        writeReports: {
            alias: 'r',
            describe: 'Write glTF error report next to the glTF file in question.',
            default: false,
            type: 'boolean'
        },
        onlyValidateTilesets: {
            alias: 'q',
            describe: 'Only validate tileset files, for quick shallow validation.',
            default: false,
            type: 'boolean'
        },
        validateIndex: {
            alias: 'vi',
            describe: 'Validate the index file.',
            default: true,
            type: 'boolean'
        },
        wffVersion: {
            alias: 'wff',
            describe: 'Version of the WFF/3tz specification to verify against',
            default: '1.1',
            type: 'string'
        },
        repairIndexOffsets: {
            alias: 'rio',
            describe: 'Repair index file offsets.',
            default: false,
            type: 'boolean'
        },
        outPath: {
            alias: 'o',
            describe: 'Outpath for repaired index file',
            default: '@3dtilesIndex1@',
            type: 'string'
        },
        autoZipFallback: {
            alias: 'azf',
            describe: 'If a 3tz read fails for any reason, attempt to read as zip instead',
            default: false,
            type: 'boolean'
        }
    }).parse(args);

async function validate(argv) {
    let filePath = argv.input;
    const writeReports = argv.writeReports;
    let message;

    let reader = {
        readBinary: readTile,
        readJson: readTileset
    };

    if (path.extname(filePath) === '.3tz') {
        if (argv.repairIndexOffsets) {
            return await archive.repairIndexOffsets(filePath, argv.outPath, argv.wffVersion);
        }
        try {
            reader = await archive.getIndexReader(filePath, argv.validateIndex, argv.wffVersion);
            filePath = utility.normalizePath(argv.innerPath);
        }
        catch(err) {
            //console.error(err.message);
            if (argv.autoZipFallback) {
                console.error(`Failed to read ${path.basename(filePath)} as indexed archive, attempting to read as plain zip`);
                try {
                    reader = await archive.getZipReader(filePath);
                    filePath = argv.innerPath;
                }
                catch(err) {
                    return -1;
                }
            } else {
                console.error(`${path.basename(filePath)} is not valid (WFF version ${argv.wffVersion})`)
                return -1;
            }
        }
    } else if (path.extname(filePath) === '.zip') {
        try {
            reader = await archive.getZipReader(filePath);
            filePath = utility.normalizePath(argv.innerPath);
        }
        catch(err) {
            return -1;
        }
    }

    try {
        if (isTile(filePath)) {
            if (argv.onlyValidateTilesets) {
                message = `${filePath} is a tile, validation skipped.`;
            } else {
                message = await validateTile({
                    reader: reader,
                    content: await reader.readBinary(filePath),
                    filePath: filePath,
                    directory: path.dirname(filePath),
                    writeReports: writeReports
                });
                }
        } else {
            message = await validateTileset({
                reader: reader,
                tileset: await reader.readJson(filePath),
                filePath: filePath,
                directory: path.dirname(filePath),
                writeReports: writeReports,
                onlyValidateTilesets: argv.onlyValidateTilesets
            });
        }
    } catch (error) {
        console.error(`Could not read input: ${error.message}`);
        return -1;
    }

    if (defined(message)) {
        console.error(message);
    } else {
        console.log(`${filePath} is valid`);
        return 0;
    }

    return -1;
}

console.log(`Validating as WFF version ${argv.wffVersion}`);

return validate(argv);
