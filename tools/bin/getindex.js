#!/usr/bin/env node
'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');
var Promise = require('bluebird');
var yargs = require('yargs');
var zlib = require('zlib');
var fileExists = require('../lib/fileExists');
const StreamZip = require('node-stream-zip');
const crypto = require('crypto');
const readline = require('readline');

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
    .command('extractIndex', 'Extract index from zip')
    .command('generateIndex', 'Generate a zip index file')
    .command('generateLargeIndex', 'Generate a zip index file from a text listing')
    .command('searchIndex', 'Search index or zip for specific file path')
    .command('validateIndex', 'Validate index')
    .command('listIndex', 'List index',
        {        
            'range': {
            alias: 'r',
            default: [0,10],
            description: 'Range of indices to list.',
            global: false,
            type: 'array'
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
    if (command === 'extractIndex') {
        return readIndexFromZip(input, output, force);
    } else if (command === 'generateIndex') {
        return generateIndex(input, output, force);
    } else if (command === 'generateLargeIndex') {
        return generateLargeIndex(input, output, force);
    } else if (command === 'searchIndex') {
        return searchIndex(input, output);
    } else if (command === 'validateIndex') {
        return validateIndex(input);
    } else if (command === 'listIndex') {
        return listIndex(input, argv.range);
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

function logCallback(message) {
    console.log(message);
}

function md5LessThan(md5hashA, md5hashB) {
    const aLo = md5hashA.readBigUInt64LE();
    const bLo = md5hashB.readBigUInt64LE();
    if (aLo == bLo) {
        const aHi = md5hashA.readBigUInt64LE(8);
        const bHi = md5hashB.readBigUInt64LE(8);
        return aHi < bHi;
    }
    return aLo < bLo;
}

function md5comp(a, b) {
    return md5LessThan(a.md5hash, b.md5hash) ? -1 : 1;
}

function md5AsUInt64(md5hashBuffer) {
    return [md5hashBuffer.readBigUInt64LE(0), md5hashBuffer.readBigUInt64LE(8)];
}

function insertSorted(indexTable, item) {
    indexTable.push(item);
    let i = indexTable.length - 1;
    let lastItem = indexTable[i];
    while (i > 0 && md5comp(lastItem, indexTable[i-1]) < 0) {
        indexTable[i] = indexTable[i-1];
        i -= 1;
    }
    indexTable[i] = lastItem;
    return indexTable;
}

// Note: this is tailored to "zipinfo -v some.zip > listing.txt"
async function generateLargeIndex(inputFile, outputFile, force) {
    const States = Object.freeze(
        {"FindCentralDirectoryEntry":1, 
        "FindFilename":2, 
        "FindOffset":3});
    let state = States.FindCentralDirectoryEntry;
    let entryPath = "";
    let offsetRE = RegExp(/offset of local header from start of archive:\s*(\d*)/gm);
    
    const fileStream = fsExtra.createReadStream(inputFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let indexTable = [];
    let foundRootTileset = false;

    console.time('Read zip entries');

    for await (const line of rl) {
        if (state == States.FindCentralDirectoryEntry && line.startsWith("Central directory entry #")) {
            state = States.FindFilename;
        } else if (state == States.FindFilename) {
            let trimmedLine = line.trim();
            if (trimmedLine.length > 0 && 
                trimmedLine !== "---------------------------") {
                entryPath = trimmedLine;

                if (!foundRootTileset && entryPath == 'tileset.json') {
                    foundRootTileset = true;
                }

                state = States.FindOffset;
            }
        } else if (state == States.FindOffset) {
            let m = offsetRE.exec(line);
            if (m !== null) {
                //console.log(`Read ${entryPath} with offset ${m[1]}`);
                state = States.FindCentralDirectoryEntry;
                let hash = crypto.createHash('md5').update(entryPath).digest();
                let offset = BigInt(m[1]);
                let item = { "md5hash": hash, "offset": offset };
                indexTable.push(item);
                
                if (indexTable.length % 1000000 == 0) {
                    console.log(`Entries in table: ${indexTable.length}`);
                    console.log(`${indexTable.length}: ${entryPath} ${item.md5hash.toString('hex')} ${item.offset}`);
                }
            }
        }
    }

    if (!foundRootTileset) {
        console.error(`No root tileset found at top level`);
        return -1;
    }

    console.timeEnd('Read zip entries');
    console.time('Sort zip index');
    // sort based on md5 hash
    indexTable.sort(md5comp);
    console.timeEnd('Sort zip index')

    for (let i = 0; i < 26 /*indexTable.length*/; i++) {
        const entry = indexTable[i];
        const [hi,lo] = md5AsUInt64(entry.md5hash);
        console.log(`${i.toString().padStart(10)}: ${hi.toString().padStart(26)} ${lo.toString().padStart(26)} offset: ${entry.offset}`);
    }
    
    console.time('Write zip index file');
    let out = fsExtra.createWriteStream(outputFile);
    let outbuffer = Buffer.alloc(24 * indexTable.length);

    // write 24 bytes for each item
    let pos = 0;
    for (let i = 0; i < indexTable.length; i++) {
        let item = indexTable[i];

        //console.log(`${i}: ${item.md5hash.toString('hex')} ${item.offset}`);
        //console.log(`${item.hash.readBigUInt64LE()} . ${item.hash.readBigUInt64LE(8)} : ${item.name}`);
        for (const value of item.md5hash.values()) {
            outbuffer.writeUInt8(value, pos);
            pos++;
        }
        outbuffer.writeBigUInt64LE(item.offset, pos);
        pos += 8;
    }
    out.write(outbuffer);
    out.close();

    console.timeEnd('Write zip index file');

    console.log(`Wrote ${indexTable.length} index entries.`);
    return 0;
}

function generateIndex(inputFile, outputFile, force) {
    return checkFileOverwritable(outputFile, force)
        .then(() => {
            let zip = new StreamZip({
                file: inputFile,
                storeEntries: true
            });
            zip.on('error', (err) => {
                console.log(`Error: ${err}`);
            })
            zip.on('ready', () => {
                console.time('Read zip entries');
                let foundTileset = false;

                let indexTable = [];
                for (const entry of Object.values(zip.entries())) {
                    if (!entry.isDirectory && entry.name != "@specialIndexFileHASH128@") {
                        let hash = crypto.createHash('md5').update(entry.name).digest();
                        let offset = entry.offset;
                        let name = entry.name;
                        if (entry.name == "tileset.json") {
                            foundTileset = true;
                        }
                        let item = { "md5hash": hash, "offset": BigInt(offset), "name": name };
                        //console.log(`${hash.readBigUInt64LE()} . ${hash.readBigUInt64LE(8)} : ${name}`);
                        indexTable.push(item);
                        //indexTable = insertSorted(indexTable, item);
                    }
                }
                console.timeEnd('Read zip entries');

                if (!foundTileset) {
                    console.error("No root tileset found at top level");
                    return Promise.reject();
                }

                console.time('Sort zip index');
                // sort based on md5 hash
                indexTable.sort(md5comp);
                console.timeEnd('Sort zip index')
                
                console.time('Write zip index file');
                let out = fsExtra.createWriteStream(outputFile);
                let outbuffer = Buffer.alloc(24 * indexTable.length);

                // write 24 bytes for each item
                let pos = 0;
                for (let i = 0; i < indexTable.length; i++) {
                    let item = indexTable[i];
                    //console.log(`${item.hash.readBigUInt64LE()} . ${item.hash.readBigUInt64LE(8)} : ${item.name}`);
                    for (const value of item.md5hash.values()) {
                        outbuffer.writeUInt8(value, pos);
                        pos++;
                    }
                    outbuffer.writeBigUInt64LE(item.offset, pos);
                    pos += 8;
                }
                out.write(outbuffer);
                zip.close();
                out.close();

                console.timeEnd('Write zip index file');

                console.log(`Archive contained ${zip.entriesCount} entries - wrote ${indexTable.length} index entries.`);
            });
            return Promise.resolve();        
        });
}

function zipIndexFind(zipIndex, searchHash) {
    let low = 0;
    let high = zipIndex.length;
    while(low <= high) {
        let mid = Math.floor(low + (high - low) / 2);
        const entry = zipIndex[mid];
        //console.log(`mid: ${mid} entry: ${entry.md5hash.toString('hex')}`);
        if(entry.md5hash.compare(searchHash) === 0)
            return mid;
        else if (md5LessThan(zipIndex[mid].md5hash, searchHash))
            low = mid + 1;
        else
            high = mid - 1;
    }

    return -1;
}

function parseIndexData(buffer) {
    if (buffer.length % 24 !== 0) {
        console.error(`Bad index buffer length: ${buffer.length}`);
        return -1;
    }
    const numEntries = buffer.length / 24;
    let index = [];
    //console.log(`Zip index contains ${numEntries} entries.`);
    for (let i = 0; i < numEntries; i++) {
        let byteOffset = i * 24;
        let hash = buffer.slice(byteOffset, byteOffset + 16);
        let offset = buffer.readBigUInt64LE(byteOffset + 16);
        index.push({"md5hash": hash, "offset": offset});
    }
    return index;
}

async function readIndexData(inputFile) {
    return fsExtra.readFile(inputFile)
        .then(buffer => parseIndexData(buffer));
}

async function searchIndex(inputFile, searchPath) {
    let extension = path.extname(inputFile);
    let zipIndex;
    console.time('Read index');
    if (extension == '.3tz') {
        zipIndex = await readIndexFromZip(inputFile);
        //console.error("Extracting index from zip not yet supported");
    } else { //if (path.filename == "@3dtilesIndex1@") {
        zipIndex = await readIndexData(inputFile);

    }
    console.timeEnd('Read index');
    console.log(`Zip index contains ${zipIndex.length} entries.`);

    let hashedSearchPath = crypto.createHash('md5').update(searchPath).digest();
    console.log(`Searching index for ${searchPath} (${hashedSearchPath.toString('hex')})`);
    
    //for (let i = 0; i < zipIndex.length; i++) {
    //    const entry = zipIndex[i];
    //    console.log(`${i}: ${entry.md5hash.toString('hex')} ${entry.offset}`);
    //}

    // let last = zipIndex[zipIndex.length-1];
    // console.log(`last item: ${last.md5hash.toString('hex')} offset: ${last.offset}`);

    console.time('Search index');
    let matchedIndex = zipIndexFind(zipIndex, hashedSearchPath);
    console.timeEnd('Search index');
    if (matchedIndex == -1) {
        console.log(`Couldn't find ${searchPath} (${hashedSearchPath.toString('hex')}) in ${inputFile}`);
        return undefined;
    }

    let entry = zipIndex[matchedIndex];
    console.log(`Matched index: ${matchedIndex} - offset: ${entry.offset}`);
    return entry;
}

async function readIndex(inputFile) {
    let extension = path.extname(inputFile);
    let zipIndex;
    if (extension == '.3tz') {
        zipIndex = await readIndexFromZip(inputFile);
        //console.error("Extracting index from zip not yet supported");
    } else { //if (path.filename == "@3dtilesIndex1@") {
        zipIndex = await readIndexData(inputFile);
        console.log(`Read zip index, contains ${zipIndex.length} entries.`);
    }
    return zipIndex;
}

async function listIndex(inputFile, range) {
    let start = 0;
    let end = -1;
    if (range.length === 1) {
        start = range[0];
    } else if (range.length === 2){
        [start, end] = range;
    } else {
        console.error(`Invalid range, ${range}`);
        return;
    }
    if (start < 0) {
        console.error(`Range start must be positive, ${start}`);
        return;
    }
    const zipIndex = await readIndex(inputFile);
    if (end < 0 || end > zipIndex.length) {
        end = zipIndex.length;
    }
    for (let i = start; i < end; i++) {
        const entry = zipIndex[i];
        const [hashHi,hashLo] = md5AsUInt64(entry.md5hash);
        console.log(`${i}: ${hashHi} ${hashLo} (${entry.md5hash.toString('hex')} offset: ${entry.offset})`);
    }
    return;
}

async function validateIndex(inputFile) {
    const zipIndex = await readIndex(inputFile);
    const numItems = zipIndex.length;
    let errors = {
        collisions: []
    };
    let valid = true;
    for (let i = 1; i < numItems; i++) {
        const prevEntry = zipIndex[i-1];
        const curEntry = zipIndex[i];
        const [curHashHi, curHashLo] = md5AsUInt64(curEntry.md5hash);
        if (prevEntry.md5hash.compare(curEntry.md5hash) === 0) {
            errors.collisions.push([i-1, i]);
        }

        const [prevHashHi, prevHashLo] = md5AsUInt64(prevEntry.md5hash);

        if (!md5LessThan(prevEntry.md5hash, curEntry.md5hash)) {
            console.warn(`Wrong sort order\n${i}: ${curEntry.md5hash.toString('hex')} (${curHashHi} ${curHashLo}) should be smaller than\n${i-1}: ${prevEntry.md5hash.toString('hex')} (${prevHashHi} ${prevHashLo})`);
            valid = false;
        }
    }

    if (errors.collisions.length) {
        for (let c of errors.collisions) {
            console.warn(`Got hash collision at index ${c[0]} and ${c[1]}`);
        }
    }

    console.log(`${inputFile} is ${valid ? "valid" : "invalid"}`);
    return valid;
}

function readIndexFromZip(inputFile, outputFile, force) {
    // console.log(`Read index from ${inputFile}`);
    let fd;
    return fsExtra.open(inputFile, 'r')
        .then(f => {
            fd = f;
            //console.log(`File opened: ${fd}`);
            return fsExtra.fstat(fd);
        })
        .then(stat => {
            //console.log(`filesize: ${stat.size} bytes`);
            const bytesToRead = 320;
            let buffer = Buffer.alloc(bytesToRead);
            let offset = stat.size - bytesToRead;
            let length = bytesToRead;
            return fsExtra.read(fd, buffer, 0, length, offset)
                .then(obj => {
                    //console.log(`Bytes read ${obj.bytesRead} buffer: ${obj.buffer} : ${obj.buffer.length}`);
                    const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
                    const START_OF_CENTRAL_DIRECTORY = 0x02014b50;
                    let start = 0, end = 0;
                    for (let i = obj.buffer.length - 4; i > 0; i--) {
                        let val = obj.buffer.readUInt32LE(i);
                        //console.log(`[${i}]: ${val} [${END_OF_CENTRAL_DIRECTORY}]`);
                        if (val == END_OF_CENTRAL_DIRECTORY) {
                            //console.log(`Found end of central directory at offset: ${i}: ${val}`);
                            end = i;
                        }
                        if (val == START_OF_CENTRAL_DIRECTORY) {
                            //console.log(`Found start of central directory at offset: ${i}: ${val}`);
                            start = i;
                            break;
                        }
                    }

                    if (start != end) {
                        //console.log(`${start} - ${end}: length: ${end-start}`);
                        return obj.buffer.slice(start); //, end-start);
                    }

                    return obj.buffer;
                });
        })
        .then(buffer => {
            // let cdh = parseCentralDirectoryHeader(buffer);
            // console.log(`File header signature: ${buffer.toString('utf8', 0, 4)}`);
            // console.log(`File made by: ${buffer.readUInt16LE(4)}`);
            // console.log(`Version needed to extract: ${buffer.readUInt16LE(6)}`);
            // console.log(`General purpose bits: ${buffer.readUInt16LE(8)}`);
            // console.log(`Compression method: ${buffer.readUInt16LE(10)}`);
            // console.log(`last mod file time: ${buffer.readUInt16LE(12)}`);
            // console.log(`last mod file date: ${buffer.readUInt16LE(14)}`);
            // console.log(`crc-32: ${buffer.readUInt32LE(16)}`);
            let compressedSize = buffer.readUInt32LE(20);
            //console.log(`compressed size: ${compressedSize}`);
            //console.log(`uncompressed size: ${buffer.readUInt32LE(24)}`);
            let filenameLength = buffer.readUInt16LE(28);
            //console.log(`file name length: ${filenameLength}`);
            let extrafieldLength = buffer.readUInt16LE(30);
            // console.log(`extra field length: ${extrafieldLength}`);
            // console.log(`file comment length: ${buffer.readUInt16LE(32)}`);
            // console.log(`disk number start: ${buffer.readUInt16LE(34)}`);
            // console.log(`internal file attributes: ${buffer.readUInt16LE(36)}`);
            // console.log(`external file attributes: ${buffer.readUInt32LE(38)}`);
            let relativeOffset = buffer.readUInt32LE(42);
            //console.log(`relative offset of local header: ${relativeOffset}`);
            //console.log(`filename: ${buffer.toString('utf8', 46, 46 + filenameLength)}`);

            // if we get this offset, then the offset is stored in the 64 bit extra field
            if (relativeOffset == 0xFFFFFFFF) {
                // parse extra field
                let extraBuffer = buffer.slice(46 + filenameLength);
                // console.log(`extra tag: ${extraBuffer.readUInt16LE(0)}`);
                // console.log(`extra size: ${extraBuffer.readUInt16LE(2)}`);
                relativeOffset = extraBuffer.readBigInt64LE(4);
                //console.log(`extra offset: ${relativeOffset}`);
            }

            const localFileHeaderLength = 30;
            const localFileHeaderSize = localFileHeaderLength + filenameLength + 
                /*extrafieldLength (note, not the same extra field, so pick something appropriate)*/ 
                + 48 /* should be enough */
                + compressedSize;
            let localFileHeaderBuffer = Buffer.alloc(localFileHeaderSize);

            //console.log(`Reading local file header from offset: ${relativeOffset}`);
            return fsExtra.read(fd, localFileHeaderBuffer, 0, localFileHeaderSize, Number(relativeOffset))
                .then(obj => obj.buffer)
                .catch(err => console.log(`Got error: ${err}`));
        })
        .then(localFileHeaderBuffer => {
            //console.log(`Read ${buffer.length}: ${buffer}`);
            // console.log("--- Local file header ---")

            const header = localFileHeaderBuffer.readUInt32LE(0);
            if (header != 0x04034b50) {
                console.error(`Bad local file header: ${header}`);
                return Promise.reject();
            }
            let compressedSize = localFileHeaderBuffer.readUInt32LE(18);
            //console.log(`compressed size: ${compressedSize}`);
            //console.log(`uncompressed size: ${localFileHeaderBuffer.readUInt32LE(22)}`);
            let filenameLength = localFileHeaderBuffer.readUInt16LE(26);
            // console.log(`file name length: ${filenameLength}`);
            let extrafieldLength = localFileHeaderBuffer.readUInt16LE(28);
            //console.log(`extra field length: ${extrafieldLength}`);
            let filename = localFileHeaderBuffer.toString('utf8', 30, 30 + filenameLength);
            //console.log(`filename: ${filename}`);

            // ok, skip past the filename and extras and we have our data
            let dataStartOffset = 30 + filenameLength + extrafieldLength;

            const indexFileDataBuffer = localFileHeaderBuffer.slice(dataStartOffset, dataStartOffset + compressedSize);
            if (defined(outputFile)) {
                return fsExtra.writeFile(outputFile, indexFileDataBuffer);
            } else {
                return parseIndexData(indexFileDataBuffer);
            }
        })
        .finally(() => {
            fsExtra.close(fd);
            //console.log(`Closed file ${fd}`);    
        });
}
