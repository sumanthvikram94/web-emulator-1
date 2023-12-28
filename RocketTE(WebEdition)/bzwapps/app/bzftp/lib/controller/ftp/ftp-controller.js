"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ftpRouter = void 0;
//import { ApiControllerAbs } from "../common/api-controller-abs";
//import { FtpService } from './ftp-service';
// import WebsocketStream from "websocket-stream";
const express_1 = __importDefault(require("express"));
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const ftp = __importStar(require("basic-ftp"));
const ssh2_sftp_client_1 = __importDefault(require("ssh2-sftp-client"));
const process_1 = require("process");
const stream_1 = require("stream");
// import { resolve } from "path";
// import { reject } from "core-js/fn/promise";
// import e from "express";
// import { EMLINK } from "constants";
// import { construct } from "core-js/fn/reflect";
const archiver = __importStar(require("archiver"));
const j_counter_1 = require("j-counter");
// var WS = require('ws');
// const Readable = require('stream').Readable;
// const websocketStream = require('websocket-stream/stream');
//const ssh = require('./ssh');
//const SSH_MESSAGE = ssh.MESSAGE;
const connPool = require('../../../../bzshared/lib/dist/connection-pool');
const SFTP_ERROR_CODE_GENERAL = 555; // SFTP error code
const TRANSFER_MODE = { BINARY: 'TYPE I', ASCII: 'TYPE A' };
const base64BitValues = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00, 0x3f,
    0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
    0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];
// const WS_READY_STATE_CONNECTING = 0;
// const WS_READY_STATE_OPEN = 1;
// const WS_READY_STATE_CLOSING = 2;
// const WS_READY_STATE_CLOSED = 3;
const WS_CLOSE_MESSAGE_LENGTH_LIMIT = 123;
// const SECURITY_BAD_CERTIFICATE_PROMPT = 1;
const SECURITY_BAD_CERTIFICATE_ALLOW = 0;
const WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR = 4999;
const WEBSOCKET_REASON_TERMPROXY_GOING_AWAY = 4000;
var hex = function (x) {
    if (x || x === 0) {
        return (x).toString(16);
    }
    else {
        return "<can't hex() unbound number>";
    }
};
var hexDump = function (a, offset, length) {
    var start = (offset ? offset : 0);
    var len = (length ? length : a.length);
    var i;
    var buff = "";
    for (i = 0; i < len; i++) {
        buff += hex(a[start + i]) + " ";
        if ((i % 16) == 15) {
            // console.log(buff);
            buff += '\n';
        }
    }
    return buff;
};
var utf8ArrayToB64 = function (data) {
    var out;
    // var start = 0;
    // var length = data.length;
    var dataLen = data.length;
    var numFullGroups = Math.floor(dataLen / 3);
    var numBytesInPartialGroup = dataLen - 3 * numFullGroups;
    var inCursor = 0;
    out = [];
    // Translate all full groups from byte array elements to Base64
    for (var i = 0; i < numFullGroups; i++) {
        var byte0 = data[inCursor++] & 0xff;
        var byte1 = data[inCursor++] & 0xff;
        var byte2 = data[inCursor++] & 0xff;
        out.push(binToB64[byte0 >> 2]);
        out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
        out.push(binToB64[(byte1 << 2) & 0x3f | (byte2 >> 6)]);
        out.push(binToB64[byte2 & 0x3f]);
    }
    // Translate partial group if present
    if (numBytesInPartialGroup != 0) {
        var byte0 = data[inCursor++] & 0xff;
        out.push(binToB64[byte0 >> 2]);
        if (numBytesInPartialGroup == 1) {
            out.push(binToB64[(byte0 << 4) & 0x3f]);
            out.push(0x3d);
            out.push(0x3d);
        }
        else {
            var byte1 = data[inCursor++] & 0xff;
            out.push(binToB64[(byte0 << 4) & 0x3f | (byte1 >> 4)]);
            out.push(binToB64[(byte1 << 2) & 0x3f]);
            out.push(0x3d);
        }
    }
    return String.fromCharCode.apply(null, out);
};
// var base64ToUint8Array = function(s){
//   var sLen = s.length;
//   var numGroups = sLen / 4;
//   var missingBytesInLastGroup = 0;
//   var numFullGroups = numGroups;
//   var inCursor = 0, outCursor = 0;
//   var i;
//   if (4 * numGroups != sLen){
//     return null;
//   }
//   if (sLen != 0){
//     if (s[sLen - 1] == '='){
//       missingBytesInLastGroup++;
//       numFullGroups--;
//     }
//     if (s[sLen - 2] == '='){
//       missingBytesInLastGroup++;
//     }
//   }
//   var resultLength = numFullGroups*3;
//   if (missingBytesInLastGroup != 0){
//     resultLength++;
//   } 
//   if (missingBytesInLastGroup == 1){
//     resultLength++;
//   }
//   var result = new Uint8Array(resultLength);
//   /* Translate all full groups from base64 to byte array elements */
//   for (i = 0; i < numFullGroups; i++){
//     var ch0 =base64BitValues[s.charCodeAt(inCursor++)];
//     var ch1 =base64BitValues[s.charCodeAt(inCursor++)];
//     var ch2 =base64BitValues[s.charCodeAt(inCursor++)];
//     var ch3 =base64BitValues[s.charCodeAt(inCursor++)];
//     var x = ((ch0 << 2) | (ch1 >> 4));
//     result[outCursor++] =  ((ch0 << 2) | (ch1 >> 4));
//     result[outCursor++] =  ((ch1 << 4) | (ch2 >> 2));
//     result[outCursor++] =  ((ch2 << 6) | ch3);
//   }
//   /* Translate partial group, if present */
//   if (missingBytesInLastGroup != 0){
//     var ch0 =base64BitValues[s.charCodeAt(inCursor++)];
//     var ch1 =base64BitValues[s.charCodeAt(inCursor++)];
//     result[outCursor++] = ((ch0 << 2) | (ch1 >> 4));
//     if (missingBytesInLastGroup == 1){
//       var ch2 =base64BitValues[s.charCodeAt(inCursor++)];
//       result[outCursor++] = ((ch1 << 4) | (ch2 >> 2));
//     }
//   }
//   return result; 
// }
const binToB64 = [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50,
    0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66,
    0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76,
    0x77, 0x78, 0x79, 0x7A, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x2B, 0x2F];
function createSecurityObjects(config, logger) {
    var readFilesToArray = function (fileList) {
        var contentArray;
        contentArray = [];
        fileList.forEach(function (filePath) {
            try {
                contentArray.push(fs.readFileSync(filePath).toString());
            }
            catch (e) {
                logger.warn('Error when reading file=' + filePath + '. Error=' + e.message);
            }
        });
        if (contentArray.length > 0) {
            return contentArray;
        }
        else {
            return null;
        }
    };
    g_securityObjects = {};
    //JSTE-17607,Decouple the root CA configuration and HTTPS
    const rootCAFiles = config?.tlsOptions?.ca;
    const rootCRFiles = config?.tlsOptions?.crl;
    if (rootCAFiles) {
        logger.debug('I see and will read in the CAs');
        g_securityObjects.ca = readFilesToArray(rootCAFiles) || '';
    }
    if (rootCRFiles) {
        g_securityObjects.crl = readFilesToArray(rootCRFiles) || '';
    }
    ;
}
var g_securityObjects;
class FTPWebsocketProxy {
    constructor(messageConfig, clientIP, context, websocket, loadws, connCounter) {
        this.uploads = [];
        this.counted = false;
        this.connIds = null;
        // this.handlers = handlers;
        this.connCounter = connCounter; // JSTE-14789. Move connCounter to head, so it's usable in close event.
        this.autoMode = {};
        this.host;
        this.hostPort;
        //this.hostSocket;
        this.usingSSH = false;
        //this.sshSessionData;
        this.hostConnected = false;
        this.clientIP = clientIP;
        // this.openFTPConnections = 0;
        this.configured = false;
        this.transferMode = 0; //sftp transfer mode
        this.logger = context.logger;
        // this.szUID = "[" + Date.now() + "] "; //to identify different ftp sessions in the log
        this.generateSessionID();
        this.logDebug('constructor', JSON.stringify(messageConfig));
        this.context = context;
        this.connPool = connPool;
        this.bufferedHostMessages = []; //while awaiting certificate verification
        this.ws = websocket;
        this.loadws = loadws;
        if (messageConfig) {
            this.hostTypeKey = messageConfig.hostTypeKey;
            this.hostDataKey = messageConfig.hostDataKey;
            this.clientTypeKey = messageConfig.clientTypeKey;
            this.clientDataKey = messageConfig.clientDataKey;
            var t = this;
            if (t.hostTypeKey && t.hostDataKey && t.clientTypeKey && t.clientDataKey) {
                websocket.on('message', (msg) => { t.handleWebsocketMessage(msg); });
                websocket.on('close', (code, reason) => {
                    t.handleWebsocketClosed(code, reason);
                });
                this.bindLoadWS(loadws);
                this.configured = true;
            }
            else {
                this.logWarn('constructor', 'Terminal websocket proxy was not supplied with valid message config description');
            }
        }
        else {
            this.logWarn('constructor', 'Terminal websocket proxy was not supplied with valid message config description');
        }
    }
    /**
     * Count the active FTP connection.
     * Should avoid count the connection in case the FTP session is closed before FTP server is connected.
     */
    addActiveCount(connData) {
        if (this.counted === false) {
            this.connCounter.addOne(); // Increase "Active FTP Connections" if the ws connection is not broken yet.
            this.counted = true; // Mark the add 1 action
            this.logger.info('Active FTP connections: ' + this.connCounter.getLastCount());
            if (!connData.isBzaVerify) {
                // Increase the FTP connection count in user report
                this.connIds = this.connPool.handleConnect({ uid: connData.userId, ip: this.clientIP, grps: connData.groupNames });
            }
        }
    }
    /**
     * Drop 1 for the "Active FTP Connections" number.
     * This should only works in case the connection is already counted by this.addActiveCount()
     */
    dropActiveCount() {
        if (this.counted === true) {
            this.connCounter.dropOne(); // Drop 1 from the "Active FTP Connections" if the add 1 action was executed.
            this.logger.info('Active FTP connections: ' + this.connCounter.getLastCount());
            if (this.connIds) {
                // Decrease the FTP connection count in user report
                this.connPool.handleDisconnect(this.connIds);
                this.connIds = null;
            }
        }
        else {
            this.counted = true; // In case the ws conn is broken before FTP server is connected, don't drop 1, and avoid the add 1 action
        }
    }
    generateSessionID() {
        this.szUID = "[" + Date.now() + "] "; //to identify different ftp sessions in the log
        this.logger.info(this.szUID + '- ' + this.identifierString());
    }
    getLogHeader(funcName) {
        return `${this.szUID}FTPWebsocketProxy, method=${funcName}: `;
    }
    logInfo(funcName, content) {
        this.logger.info(this.getLogHeader(funcName) + content);
    }
    logDebug(funcName, content) {
        this.logger.debug(this.getLogHeader(funcName) + content);
    }
    logWarn(funcName, content) {
        this.logger.warn(this.getLogHeader(funcName) + content);
    }
    logSevere(funcName, content) {
        this.logger.severe(this.getLogHeader(funcName) + 'Error Encountered!');
        console.error(content);
    }
    logVerbose(funcName, content) {
        this.logger.log(this.logger.FINER, this.getLogHeader(funcName) + content);
    }
    isDebugEnabled() {
        try {
            if (global.COM_RS_COMMON_LOGGER.getComponentLevel('com.rs.bzftp.ftpdata')) {
                return global.COM_RS_COMMON_LOGGER.getComponentLevel('com.rs.bzftp.ftpdata') > 2;
            }
            const ftpLogLevel = this.context.plugin.server.config.user.logLevels['com.rs.bzftp.*'];
            const ftpDataLogLevel = this.context.plugin.server.config.user.logLevels['com.rs.bzftp.ftpdata'];
            const ftpDataStarLogLevel = this.context.plugin.server.config.user.logLevels['com.rs.bzftp.ftpdata.*'];
            return (ftpDataStarLogLevel && ftpDataStarLogLevel > 2)
                || (ftpDataLogLevel && ftpDataLogLevel > 2)
                || (ftpLogLevel && ftpLogLevel > 2);
        }
        catch (e) {
            return false; // 'this.context.plugin.server.config.user.logLevels'  is undefined on zowe 
        }
    }
    createArchiver() {
        const archive = archiver.create('zip', { zlib: { level: 9 } }); // creates the archiver
        archive.on('warning', function (err) {
            console.warn(err);
        });
        archive.on('error', function (err) {
            throw err;
        });
        return archive;
    }
    async _appendDirToArchive(archive, sftpclient, remotePath, parentPath) {
        let fileList = await sftpclient.list(remotePath);
        this.logDebug('_appendDirToArchive', 'Got list for ' + remotePath);
        for (let f of fileList) {
            const fileName = f.name.trim();
            if (f.type === 'd') {
                archive.append(Buffer.from([]), { name: fileName + '/', prefix: parentPath }); // adds the folder into ZIP
                this.logDebug('_appendDirToArchive', 'Appending folder ' + fileName + ' into zip');
                let newdir = remotePath + sftpclient.remotePathSep + fileName;
                await this._appendDirToArchive(archive, sftpclient, newdir, parentPath ? parentPath + '/' + f.name : f.name);
                this.logDebug('_appendDirToArchive', 'Appended folder ' + fileName + ' into zip');
            }
            else if (f.type === '-') {
                const stream = new stream_1.PassThrough(); // it output each data it receives directly
                stream.on('end', () => {
                    this.logDebug('_appendDirToArchive', `Ended streaming for ${fileName}`);
                });
                stream.on('resume', () => {
                    this.logDebug('_appendDirToArchive', `Stream on resume: ${fileName}`);
                });
                this.logDebug('_appendDirToArchive', 'Appending file ' + fileName + ' into zip');
                archive.append(stream, { name: fileName, prefix: parentPath }); // prefix means the subfolder name in ZIP
                let src = remotePath + sftpclient.remotePathSep + fileName;
                const autoType = this.getAutoMode(fileName);
                this.logInfo('_appendDirToArchive', autoType + ', ' + (parentPath ? parentPath + '/' + fileName : fileName));
                const encoding = autoType === TRANSFER_MODE.ASCII ? 'utf-8' : null; // ssh2-sftp-client doesn't support type I, type A yet.
                await sftpclient.get(src, stream, { encoding });
                this.logDebug('_appendDirToArchive', 'Appended file ' + fileName + ' into zip');
                stream.end();
            }
            else {
                this.logWarn('_appendDirToArchive', `DownloadDir: File ignored: ${fileName} not regular file`);
            }
        }
    }
    async archiveDir(sftpclient, destination, remotePath) {
        if (!sftpclient)
            throw 'sftpclient not defined';
        const archive = this.createArchiver();
        archive.pipe(destination); // pipe the ZIP into destination stream
        await this._appendDirToArchive(archive, sftpclient, remotePath);
        await archive.finalize(); // All files are added to ZIP, ready to close
    }
    bindLoadWS(ws) {
        let isStart = false;
        let stream = new Map();
        ws.onmessage = async (event) => {
            event.data = (function (raw) {
                try {
                    return JSON.parse(raw);
                }
                catch (err) {
                    return raw;
                }
            })(event.data);
            const name = event.data.name;
            if (event.data.type === 'new upload prepare') {
                this.uploads = [];
                // When uploading 0 size file, we use an empty buffer instead of stream to avoid issues
                if (event.data.size !== undefined && event.data.size === 0) {
                    //stream.set(name, Buffer.from([]));
                    const rs = new stream_1.Readable();
                    rs.push(null); // Done writing data
                    stream.set(name, rs);
                }
                else {
                    // Creates the readable stream for file upload
                    const rs = new stream_1.Readable();
                    this.logDebug('ws.onmessage', 'readableHighWaterMark: ' + rs.readableHighWaterMark);
                    rs.on('close', () => {
                        this.logDebug('ws.onmessage', 'Readable stream closed');
                    });
                    rs.on('end', () => {
                        this.logDebug('ws.onmessage', 'Readable stream ended');
                    });
                    rs.on('error', (reason) => {
                        this.logSevere('ws.onmessage', 'Readable stream error: ' + reason);
                    });
                    rs.on('pause', () => {
                        this.logDebug('ws.onmessage', 'readableLength (at pause): ' + rs.readableLength);
                    });
                    rs.on('resume', () => {
                        this.logDebug('ws.onmessage', 'readableLength (at resume): ' + rs.readableLength);
                    });
                    rs._read = () => {
                        this.logDebug('ws.onmessage', '_read() triggered');
                    };
                    stream.set(name, rs);
                }
            }
            if (event.data.type === 'ftp start upload') {
                isStart = true;
                let result;
                try {
                    this.logDebug('ws.onmessage', 'readableLength (at ftp start upload): ' + stream.get(name).readableLength);
                    const uploadStream = stream.get(name);
                    if (this.sftpclient) {
                        let mode;
                        if (!this.transferMode)
                            mode = "utf-8";
                        else
                            mode = null;
                        result = { message: await this.sftpclient.put(uploadStream, this.fullPath(name), { encoding: mode }) }; //keep the same format with other ftp type.
                    }
                    else {
                        result = await this.ftpclient.uploadFrom(uploadStream, name);
                    }
                    this.logDebug('ws.onmessage', 'Result of basic ftp upload: ' + result);
                    const message = Object.assign({ message: result }, { name, status: result.code === 550 ? 'failed' : 'successfully', isLast: event.data.isLast });
                    this.SendUpMsg(message);
                    if (!Buffer.isBuffer(uploadStream)) {
                        uploadStream.destroy();
                    }
                    stream.delete(name);
                }
                catch (err) {
                    this.logSevere('ws.onmessage', 'Upload error: ' + err);
                    // console.error(err);
                    const { code, message } = err;
                    const rep = Object.assign({}, {
                        name, status: 'failed',
                        isLast: event.data.isLast,
                        message: err.message,
                        err: { code, message }
                    });
                    // this.SendCommErr(message);
                    this.SendUpMsg(rep);
                    const upstream = stream.get(name);
                    if (!Buffer.isBuffer(upstream)) {
                        upstream.destroy();
                    }
                    stream.delete(name);
                }
            }
            if (isStart && event.data.type === 'ftp upload transfer') {
                const buffer = Buffer.from(new Uint8Array(event.data.data));
                const stramrd = stream.get(name);
                this.logDebug('ws.onmessage', 'event.data.data length: ' + event.data.data.length);
                this.logDebug('ws.onmessage', 'buffer length: ' + buffer.length);
                if (stramrd && !Buffer.isBuffer(stramrd)) {
                    stramrd.push(buffer);
                    this.logDebug('ws.onmessage', 'readableLength (push): ' + stream.get(name).readableLength);
                }
            }
            if (isStart && event.data.type === 'ftp end upload') {
                isStart = false;
                (0, process_1.nextTick)(() => {
                    this.logDebug('ws.onmessage', 'Ends the readable stream');
                    const stramrd = stream.get(name);
                    if (stramrd && !Buffer.isBuffer(stramrd)) {
                        stramrd.push(null);
                    }
                });
            }
            // if(event.data.type === 'upload stop prepare binary data') {
            //   // const ms = {
            //   //   t: 'UPLOADPREPARE',
            //   //   data: "upload data is ready",
            //   //   name: event.data.name,
            //   //   isLast: ele.isLast
            //   // }
            //   const ms = {
            //     t: 'UPLOADPREPARE',
            //     data: "upload data is ready",
            //     name: event.data.name,
            //     message: response
            //   }
            //  // this.ws.send(JSON.stringify(ms));
            // }
        };
        ws.onclose = (event) => {
            this.uploads = [];
            //console.log(event, 'PerformDownLoad onclose');
        };
        ws.onerror = (event) => {
            this.uploads = [];
            //console.log(event, 'PerformDownLoad onerror');
        };
    }
    // ListParser(rawList: string) : ftp.FileInfo[] {
    //   var t = this;
    //   let fi: ftp.FileInfo[];
    //   fi = [];
    //   //t.logger.info('FTPWebsocketProxy, method=ListParser: ');
    //   const file = new ftp.FileInfo("Test");
    //   file.size = 1234;
    //   file.user = "MyUser";
    //   file.group = "MyGroup";
    //   file.hardLinkCount = 1;
    //   file.rawModifiedAt = " " + " " + " ";
    //   file.permissions = {
    //       user: 500,
    //       group: 500,
    //       world: 500,
    //   };
    //   file.type = ftp.FileType.File; // TODO change this if DEVICE_TYPE implemented
    //   fi[0] = file;
    //   return fi;
    // }
    identifierString() {
        if (!this.host && !this.port) {
            return String('[New Connection, ClientIP=' + this.clientIP + ']');
        }
        return String('[Host=' + this.host + ', Port=' + this.port + ', ClientIP=' + this.clientIP + ']');
    }
    ;
    handleWebsocketMessage(msg) {
        this.logDebug('handleWebsocketMessage', this.filterPassword(msg) + ", configured: " + this.configured + ", readyState: " + this.ws.readyState);
        if (this.configured !== true && this.ws.readyState < 2) {
            // The this.configured is not set to false when host connection is closed, so this logic is not correctly handling the case when ws is open but ftp host is disconnected.
            // Instead, for JSTE-14789, this.configured is not set to true because error happend during "this.bindLoadWS()" (the loadws is null...).
            // I will leave it here for now, should consider whether this is still required in future.
            this.closeConnection(this.ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY, 'WS open when expected to be closed');
            return;
        }
        this.handleTerminalClientMessage(msg, this.ws);
    }
    /*
      decrementCounter() : void {
        this.openFTPConnections--;
        this.logger.info(this.identifierString()+' Websocket closed. Total remaining terminals connected: '+ this.openFTPConnections);
        if (this.hostTypeKey == 'FTP_HOST_MESSAGE') {
          this.openFTPConnections--;
          this.logger.info('Total FTP sessions connected: '+ this.openFTPConnections);
        }
      }
    */
    closeConnection(ws, code, message) {
        this.logInfo('closeConnection', message + ', code: ' + code);
        if (this.hostConnected) {
            //this.decrementCounter();
            this.hostConnected = false;
        }
        try {
            //this.hostSocket.destroy();
        }
        catch (e) {
            this.logWarn('closeConnection', 'Error when destroying host socket. e=' + e.message);
        }
        if (ws.readyState < 2) { //if still open
            ws.close(code, message.substring(0, WS_CLOSE_MESSAGE_LENGTH_LIMIT)); //web limited to length=123
        }
    }
    handleWebsocketClosed(code, reason) {
        /*
        if (this.hostSocket) {
          if (this.hostConnected) {
            this.decrementCounter();
          }
          try {
            this.hostSocket.destroy();//kill the host socket too
          } catch (e) {
            this.logger.warn(this.identifierString()+' Error when destroying host socket. e='+e.message);
          }
        }
        */
        if (this.sftpclient) {
            if (this.hostConnected)
                //Still connected to FTP server
                this.logInfo('handleWebsocketClosed', code + ' reason: ' + reason);
            this.hostConnected = false;
            this.sftpclient.end();
        }
        else {
            if ((this.hostConnected) && (!this.ftpclient.closed)) {
                //Still connected to FTP server
                this.logInfo('handleWebsocketClosed', code + ' reason: ' + reason);
                this.hostConnected = false;
                this.ftpclient.close(); //force FTP session to close
            }
        }
        this.dropActiveCount();
    }
    handleTerminalClientMessage(message, ws) {
        var jsonObject;
        try {
            jsonObject = JSON.parse(message);
        }
        catch (err) {
            this.logVerbose('handleTerminalClientMessage', ' Websocket client message content=' + err);
            jsonObject = message;
        }
        this.logDebug('handleTerminalClientMessage', 'Websocket client message received. Length=' + message.length);
        this.logVerbose('handleTerminalClientMessage', 'Websocket client message content=' + message);
        if (jsonObject) {
            /*
            if (this.handlers) {
              let handlerlen = this.handlers.length;
              for (let i = 0; i < handlerlen; i++) {
                try {
                  let result = this.handlers[i].handleClientMessage(jsonObject, this);
                  if (result && result.response) {
                    this.wsSend(ws,JSON.stringify(result.response));
                    if (!result.continue) {
                      return;
                    }
                  }
                } catch (e) {
                  this.logger.warn('Terminal handler # '+i+' threw exception on handle client message. E='+e.stack);
                }
              }
            }
            */
            if (this.hostConnected === false) {
                if (jsonObject.t === 'CONFIG') {
                    if (jsonObject.sessionType === "SFTP") {
                        this.sftpclient = new ssh2_sftp_client_1.default('bzw_sftp');
                        /*
                        // Hook into the data stream to detect when the SFTP server is asking to set a new password
                        this.sftpclient._sshstream.on('USERAUTH_PASSWD_CHANGEREQ', () => {
                          console.log("USERAUTH_PASSWD_CHANGEREQ");
                          callback(  // Do nothing before noon
                            moment().hour() < 12 ? NoErr : "SFTP server is asking for new password"
                          );
                        });
                        */
                        this.sftpclient.on("error", (err) => {
                            this.logSevere('sftpclient.onError', err);
                        });
                        this.sftpclient.on("end", () => {
                            this.logDebug('sftpclient.onEnd', 'SFTP connection closing');
                            if (this.hostConnected) { //stop double notify
                                //The sftp session is closed, notify tecore
                                this.hostConnected = false;
                                let result;
                                result = {};
                                result.t = "CLOSED";
                                result.error = { "code": "ECONNRESET", "message": "Connection closed by SFTP server" };
                                var stringReply = JSON.stringify(result);
                                this.wsSend(this.ws, stringReply);
                            }
                        });
                    }
                    else {
                        this.ftpclient = new ftp.Client(jsonObject.passive);
                        this.ftpclient.ftp.verbose = this.isDebugEnabled();
                    }
                    this.connect(jsonObject.host, jsonObject.port, ws, jsonObject.sessionType, jsonObject.username, jsonObject.password, jsonObject.hostdir, jsonObject.certificateAction, jsonObject.alternatePrincipleName, jsonObject.keepAliveTimerOptions, jsonObject.keepAliveTimerValue, jsonObject.tlsMinVersion, jsonObject.tlsMaxVersion)
                        .then(result => {
                        const connData = jsonObject.connData;
                        this.Connected(result, connData);
                    })
                        .catch(err => {
                        this.logSevere('handleTerminalClientMessage', err);
                    });
                }
            }
            else {
                if (jsonObject.t === 'CERT_RES') {
                    if (this.awaitingCertificateVerification) {
                        if (jsonObject.fp === this.outstandingCertFingerprint) {
                            if (jsonObject.a === true) { //accepted
                                this.logDebug('handleTerminalClientMessage', 'Certificate accepted by client, processing buffered host data messages. Messages to process=' + this.bufferedHostMessages.length);
                                var hostMessage;
                                while (this.bufferedHostMessages.length > 0) {
                                    hostMessage = this.bufferedHostMessages.pop();
                                    this.handleData(hostMessage, ws);
                                }
                                this.awaitingCertificateVerification = false;
                            }
                            else { //rejected
                                for (var i = 0; i < this.bufferedHostMessages.length; i++) {
                                    delete this.bufferedHostMessages[i];
                                }
                                this.bufferedHostMessages = [];
                                var errorMessage = { message: this.identifierString() + ' Certificate rejection recieved.',
                                    t: 'CERT_REJECT' };
                                this.logDebug('handleTerminalClientMessage', errorMessage.message);
                                if (this.ws.readyState === 1) {
                                    this.ws.send(JSON.stringify(errorMessage));
                                }
                                else {
                                    this.logWarn('handleTerminalClientMessage', 'WebSocket is not open: readyState ' + this.ws.readyState);
                                }
                            }
                        }
                        else {
                            this.logWarn('handleTerminalClientMessage', 'CERT_RES seen but fingerprint does not match outstanding certificate request.');
                        }
                    }
                    else {
                        this.logDebug('handleTerminalClientMessage', 'CERT_RES seen but not awaiting any certificate verification.');
                    }
                }
                else if (jsonObject.t == "COMM") {
                    this.SendCmd(jsonObject.cmd).then(result => this.SendCommMsg(result)).catch(err => this.SendCommErr(err));
                }
                else if (jsonObject.t == "LIST") {
                    this.PerformList(jsonObject.cmd).then(result => this.SendListMsg(result)).catch(err => this.SendCommErr(err));
                }
                else if (jsonObject.t == "DOWNLOAD") {
                    const option = jsonObject.option || {};
                    // this.PerformDownLoad(option.localPath, option.remotePath, option.url, option.config);
                    this.ws.ignorePingPongTimer = new Date().getTime();
                    this.PerformDownLoad(option)
                        .then(result => this.SendDownMsg(result))
                        .catch(err => this.SendCommErr(err));
                }
                else if (jsonObject.t == "DOWNLOAD_FINISH") {
                    this.ws.ignorePingPongTimer = null;
                }
                else if (jsonObject.t == "UPLOAD") {
                    const option = jsonObject.option || {};
                    this.ws.ignorePingPongTimer = new Date().getTime();
                    this.PerformUpLoad(jsonObject.option.data, jsonObject.option.remotePath)
                        .then(result => this.SendUpMsg(result))
                        .catch(err => {
                        this.ws.ignorePingPongTimer = null;
                        this.SendCommErr(err);
                    });
                }
                else if (jsonObject.t == "EXPLICIT") {
                    this.ExplicitTLS(jsonObject.certificateAction, jsonObject.alternatePrincipleName, jsonObject.tlsMinVersion, jsonObject.tlsMaxVersion)
                        .then(result => this.SendExplicitMsg(result))
                        .catch(err => this.SendCommErr(err));
                } /*
                else if (jsonObject.t === this.clientTypeKey) {
                  var data = base64ToUint8Array(jsonObject[this.clientDataKey]);
                  var dataBuffer = new Buffer(data);
                  if (this.usingSSH && this.sshSessionData){
                    var sshData = {'msgCode':SSH_MESSAGE.SSH_MSG_CHANNEL_DATA,'data':dataBuffer};
                    ssh.sendSSHData(this,sshData);
                  }
                  else {
                    this.netSend(dataBuffer);
                  }
                }
                else if (jsonObject.t === 'SSH_USER_AUTH_RES') {
                  if (this.usingSSH && this.sshSessionData) {
                    switch (jsonObject.m) {
                    case 'publickey':
                      if (jsonObject.alg && jsonObject.d && jsonObject.qo) {//this part is just for querying if the pubkey will be supported
                        var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'queryOnly':jsonObject.qo,'algorithm':jsonObject.alg,'blob':jsonObject.data};
                        ssh.sendSSHData(this,credential);
                      }
                      else if (jsonObject.alg && jsonObject.k && jsonObject.s) {
                        var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'algorithm':jsonObject.alg,'key':jsonObject.k,'signature':jsonObject.s};
                        ssh.sendSSHData(this,credential);
                      }
                      else {
                        this.logger.warn('Malformed SSH_USER_AUTH_RES for publickey. Missing alg, and k,s or d,qo');
                      }
                      break;
                    case 'password':
                      var credential = {'msgCode':SSH_MESSAGE.SSH_MSG_USERAUTH_REQUEST,'method':jsonObject.m,'username':jsonObject.u,'password':jsonObject.p};
                      ssh.sendSSHData(this,credential);
                      break;
                    case 'hostbased':
                      break;
                      
                    }
                  } else {
                    this.logger.debug('SSH_USER_AUTH type seen while not setup for SSH.');
                    //TODO send error msg to client
                  }
                }
                else if (jsonObject.t === 'SSH_USER_AUTH_INFO_RES') {
                  if (this.usingSSH && this.sshSessionData) {
                    ssh.sendSSHData(this,{
                      msgCode: SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_RESPONSE,
                      responses: jsonObject.res
                    });
                  }
                }
                else if (jsonObject.t === 'SSH_CH_REQ') {
                  if (this.usingSSH && this.sshSessionData) {
                    ssh.sendSSHData(this,{
                      msgCode: SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST,
                      channel: (jsonObject.ch ? jsonObject.ch : null),
                      type: jsonObject.reqt,
                      reply: jsonObject.reply,
                      requestContents: jsonObject.data
                    });
                  }
                  else {
                    this.logger.debug('Ignoring SSH_CH_REQ when SSH not in use or not ready');
                  }
                }*/
            }
            if (jsonObject.t === 'IP_REQ') {
                /*This ability is for allowing the client to know what its IP is so that it can
                  tell terminal servers what its true IP is.*/
                this.wsSend(ws, JSON.stringify({
                    "t": "IP_RES",
                    "data": this.clientIP
                }));
            }
        }
    }
    ;
    // netSend(buffer: string) : void {
    //   this.logDebug('netSend', 'Writing to host socket. Length='+buffer.length)
    //   this.logVerbose('netSend', 'Content to be sent to host socket=\n'+hexDump(buffer))
    //   //this.hostSocket.write(buffer);
    // }
    Connected(result, connData) {
        this.logDebug('Connected', JSON.stringify(result));
        this.hostConnected = true;
        result.t = "CONNECT";
        var stringReply = JSON.stringify(result);
        this.wsSend(this.ws, stringReply);
        this.addActiveCount(connData);
    }
    SendCommMsg(result) {
        result.t = "COMM";
        this.logDebug('SendCommMsg', JSON.stringify(result));
        var stringReply = JSON.stringify(result);
        this.wsSend(this.ws, stringReply);
    }
    SendExplicitMsg(result) {
        result.t = "EXPLICIT";
        this.logInfo('SendExplicitMsg', JSON.stringify(result));
        var stringReply = JSON.stringify(result);
        this.wsSend(this.ws, stringReply);
    }
    SendListMsg(result) {
        var list = {};
        // list.data = result;
        list = result;
        list.t = "LIST";
        this.logDebug('SendListMsg', JSON.stringify(list));
        var stringReply = JSON.stringify(list);
        this.wsSend(this.ws, stringReply);
    }
    SendCommErr(result) {
        result.t = "Err";
        const errReply = JSON.stringify(result, ["t", "code", "message"]);
        this.logWarn('SendCommErr', result);
        this.wsSend(this.ws, errReply);
    }
    SendDownMsg(result) {
        result = result || {};
        result.code = result.code || 200;
        result.t = "DOWNLOAD";
        const stringReply = JSON.stringify(result);
        this.logDebug('SendDownMsg', stringReply);
        this.wsSend(this.ws, stringReply);
    }
    SendUpMsg(result) {
        result = result || {};
        result.code = result.code || 200;
        result.t = "UPLOAD";
        this.ws.ignorePingPongTimer = null;
        const stringReply = JSON.stringify(result);
        this.logInfo('SendUpMsg', stringReply);
        this.wsSend(this.ws, stringReply);
    }
    wsSend(ws, data) {
        this.logDebug('wsSend', 'Websocket sending client message. Length=' + data.length);
        this.logVerbose('wsSend', 'Content to be sent to client=\n' + data);
        try {
            if (ws.readyState === 1) {
                ws.send(data);
            }
            else {
                this.logWarn('wsSend', 'WebSocket is not open: readyState ' + ws.readyState);
            }
        }
        catch (e) {
            this.logVerbose('wsSend', ' Content failed to send=\n' + data);
        }
    }
    handleData(data, ws) {
        var t = this;
        try {
            this.logInfo('handleData', JSON.stringify(data));
            this.logDebug('handleData', 'Received host data. Length=' + data.length);
            this.logVerbose('handleData', 'Content of host data=\n' + hexDump(data));
            var replies;
            replies = [];
            //let inventory: Array<Boat, SpaceShip, Wagon> 
            /*
            if (t.usingSSH){
              var sshMessages = ssh.processEncryptedData(t,data);
              if (sshMessages.length > 0) {
                sshMessages.forEach(function(sshMessage) {
                  switch (sshMessage.type) {
                  case SSH_MESSAGE.SSH_MSG_USERAUTH_INFO_REQUEST:
                    sshMessage.t = 'SSH_USER_AUTH_INFO_REQ';
                    replies.push(sshMessage);
                    break;
                  case SSH_MESSAGE.SSH_MSG_USERAUTH_PK_OK:
                    replies.push({t:'SSH_USER_AUTH_PK_OK'});
                    break;
                  case SSH_MESSAGE.SSH_MSG_USERAUTH_BANNER:
                  case SSH_MESSAGE.SSH_MSG_CHANNEL_DATA:
                    var b64Data = utf8ArrayToB64(new Buffer( (sshMessage.type === SSH_MESSAGE.SSH_MSG_CHANNEL_DATA) ? sshMessage.readData : sshMessage.message,'utf8'));
                    var reply = { t: t.hostTypeKey};
                    reply[t.hostDataKey] = b64Data;
                    replies.push(reply);
                    break;
                  case SSH_MESSAGE.SSH_MSG_SERVICE_ACCEPT:
                    replies.push({
                      t: "SSH_USER_AUTH_REQ"
                    });
                    break;
                  case SSH_MESSAGE.SSH_MSG_DISCONNECT:
                    var errorMessage = 'SSH session disconnected';
                    t.logger.warn(t.identifierString()+' '+errorMessage);
                    t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_GOING_AWAY,errorMessage);
                    break;
                  case SSH_MESSAGE.SSH_MSG_CHANNEL_REQUEST:
                    var b64Data = utf8ArrayToB64(new Buffer(sshMessage.data,'utf8'));
                    replies.push({
                      "t": "SSH_CH_REQ",
                      "ch": sshMessage.recipientChannel,
                      "reqt": sshMessage.requestName,
                      "reply": sshMessage.needsReply,
                      "B64": b64Data
                    });
                    break;
                  case SSH_MESSAGE.SSH_MSG_USERAUTH_FAILURE:
                    t.logger.debug('Probably user or password was wrong.');
                    replies.push({
                      t: "SSH_USER_AUTH_REQ"
                    });
                    break;
                  case SSH_MESSAGE.ERROR:
                    var errorMessage = 'SSH encountered error='+sshMessage.msg;
                    t.logger.warn(t.identifierString()+' '+errorMessage);
                    t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR,errorMessage);
                    break;
                  default:
                    //ignore
                  }
                });
              }
            } else*/ {
                var b64Data = utf8ArrayToB64(data);
                var reply = { t: t.hostTypeKey };
                reply[t.hostDataKey] = b64Data;
                replies.push(reply);
            }
            if (replies.length > 0) {
                replies.forEach(function (reply) {
                    var stringReply = JSON.stringify(reply);
                    t.wsSend(ws, stringReply);
                });
                clearTimeout(ws.timeOutHandle);
            }
        }
        catch (e) {
            var errorMessage = 'Host communication error=' + e.message;
            t.logWarn('handleData', errorMessage);
            t.closeConnection(ws, WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, errorMessage);
        }
    }
    ;
    fullPath(str) {
        if (/^[/\\\\]/.test(str))
            return str;
        else {
            return (this.hostdir === '/' ? '' : this.hostdir) + "/" + str;
        }
    }
    filterPassword(str) {
        //Filter out the user FTP passwords from showing up in bzw log
        let str2 = str;
        if (/PASS [^\"]+/.test(str2))
            return str2.replace(/PASS [^\"]+/, "PASS ###");
        return str2.replace(/\"password\":\"[^\"]+\"/, "\"password\":\"###\"");
    }
    async SendCmd(command) {
        var t = this;
        this.logInfo('SendCmd', this.filterPassword(command));
        return new Promise((resolve, reject) => {
            if (this.sftpclient) {
                if (command.toUpperCase() == "PWD") {
                    if (this.hostdir === undefined) {
                        this.sftpclient.cwd().then(comm => {
                            this.logDebug('SendCmd', comm);
                            this.hostdir = comm;
                            resolve({ code: 257, message: "257 \"" + comm + "\"" });
                        }).catch(err => {
                            reject(err);
                        });
                    }
                    else {
                        resolve({ code: 257, message: "257 \"" + this.hostdir + "\"" });
                    }
                }
                else {
                    this.logger.debug('=====cwd=====' + command + '|');
                    let [cmd, ...rest] = command.split(' ');
                    this.logger.debug('=====cmd=====' + cmd + '...rest' + rest);
                    let rest2 = rest.join(' ');
                    this.logger.debug('=====rest2=====' + rest2);
                    cmd = cmd.toUpperCase();
                    if ((cmd == "CWD") || (cmd == "CD")) {
                        //Check if isDirectory too
                        this.sftpclient.realPath(this.fullPath(rest2)).then(realPath => {
                            this.logger.debug('======realPath========' + realPath);
                            this.sftpclient.exists(realPath).then(comm => {
                                this.logger.debug("comm: " + comm);
                                if (comm == false) {
                                    resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" }); //path does not exist and realPath will be null
                                }
                                else if (comm == '-') {
                                    resolve({ code: 503, message: "503 \"" + realPath + "\"" }); //path is a file, not a folder
                                }
                                else {
                                    this.hostdir = realPath;
                                    resolve({ code: 250, message: "250 \"" + this.hostdir + "\"" }); //path is a folder
                                }
                            }).catch(err => {
                                resolve({ code: 503, message: "503 \"" + realPath + "\"" });
                            });
                        }).catch(err => {
                            resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                        });
                    }
                    else if (cmd == 'HELP') {
                        const validCMD = ['PWD', 'CWD', 'CD', 'DELE', 'LS', 'MKD', 'MKDIR', 'RMD', 'RMDIR', 'RENAME', 'CHMOD', 'TYPE'];
                        resolve({ code: 200, message: `214-The following commands are recognized: ${validCMD.join(' ')} HELP command successful.` });
                    }
                    else if (cmd == "DELE") {
                        //Deletes files only
                        this.sftpclient.delete(this.fullPath(rest2)).then(comm => {
                            this.logDebug('SendCmd', comm);
                            resolve({ code: 200, message: "200 \"" + comm + "\"" });
                        }).catch(err => {
                            resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                        });
                    }
                    else if ((cmd == "MKD") || (cmd == "MKDIR")) {
                        this.sftpclient.mkdir(this.fullPath(rest2), false).then(comm => {
                            this.logDebug('SendCmd', comm);
                            if (comm.indexOf("already exists") > 0) {
                                resolve({ code: 503, message: "503 \"" + comm + "\"" });
                            }
                            else {
                                resolve({ code: 200, message: "200 \"" + comm + "\"" });
                            }
                        }).catch(err => {
                            resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                        });
                    }
                    else if ((cmd == "RMD") || (cmd == "RMDIR")) {
                        //Deletes directory only.. second parameter is if we want to do recursive delete of all subfolders/files..
                        this.sftpclient.rmdir(this.fullPath(rest2), true).then(comm => {
                            resolve({ code: 200, message: "200 \"" + comm + "\"" });
                        }).catch(err => {
                            resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                        });
                    }
                    else if (cmd == "RENAME") {
                        const RE_LINE = new RegExp("\"([^\"]+)\"\\s+(.*)");
                        let groups = rest2.match(RE_LINE);
                        if ((!groups) || (groups.length < 3)) {
                            resolve({ code: 503, message: "503 Rename command invalid parameters" });
                        }
                        else {
                            this.sftpclient.rename(this.fullPath(groups[1]), this.fullPath(groups[2])).then(comm => {
                                resolve({ code: 200, message: "200 \"" + comm + "\"" });
                            }).catch(err => {
                                resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                            });
                        }
                    }
                    else if (cmd == "CHMOD") {
                        // 'CHMOD 777 aaa' from tecore
                        let groups = rest;
                        if ((!groups) || (groups.length < 2)) {
                            resolve({ code: 503, message: "503 Chmod command invalid parameters" });
                        }
                        else {
                            this.sftpclient.chmod(this.fullPath(groups[1]), groups[0]).then(comm => {
                                resolve({ code: 200, message: "200 \"" + comm + "\"" });
                            }).catch(err => {
                                resolve({ code: 503, message: "503 \"" + this.fullPath(rest2) + "\"" });
                            });
                        }
                    }
                    else if (cmd == "TYPE") {
                        if (rest2 == "A") {
                            this.logInfo('SendCmd', 'ASCII mode');
                            this.transferMode = 0;
                        }
                        else {
                            this.logInfo('SendCmd', 'Binary mode');
                            this.transferMode = 1;
                        }
                        resolve({ code: 200, message: "200 \"" + "OK" + "\"" });
                    }
                    else if ((cmd == "LS") || (cmd == "LIST")) {
                        this.PerformList(command).then(comm => {
                            resolve(comm);
                        }).catch(err => {
                            reject(err);
                        });
                    }
                    else {
                        resolve({ code: 500, message: "500 unknown command" });
                    }
                }
            }
            else {
                this.ftpclient.sendIgnoringError(command).then(comm => {
                    resolve(comm);
                }).catch(err => {
                    reject(err);
                });
            }
        });
    }
    fixPerm(str) {
        let ret = "";
        if (/[r]/.test(str)) {
            ret += 'r';
        }
        else {
            ret += '-';
        }
        if (/[w]/.test(str)) {
            ret += 'w';
        }
        else {
            ret += '-';
        }
        if (/[x]/.test(str)) {
            ret += 'x';
        }
        else {
            ret += '-';
        }
        return ret;
    }
    preg_quote(str, delimiter) {
        return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', ''), '\\$&');
    }
    globStringToRegex(str) {
        return new RegExp(this.preg_quote(str).replace(/\\\*/, '.*').replace(/\\\?/, '.'), '');
    }
    async PerformList(command) {
        var t = this;
        this.logInfo('PerformList', command);
        return new Promise((resolve, reject) => {
            if (this.sftpclient) {
                let [cmd, ...rest] = command.split(' ');
                let rest2 = rest.join(' ');
                this.sftpclient.list(this.hostdir, this.globStringToRegex(rest2)).then(list => {
                    //Need to convert sftp list response into a format bzw uses...
                    /*
                    {
                      type: // file type(-, d, l)
                      name: // file name
                      size: // file size
                      modifyTime: // file timestamp of modified time
                      accessTime: // file timestamp of access time
                      rights: {
                        user:
                        group:
                        other:
                      },
                      owner: // user ID
                      group: // group ID
                    }
                    */
                    let newlist = [];
                    list.forEach(function (item) {
                        let newItem;
                        newItem = {};
                        newItem.Name = item.name;
                        newItem.Size = item.size;
                        let day = new Date(item.modifyTime);
                        newItem.Date = day.toLocaleDateString() + " " + day.toLocaleTimeString();
                        newItem.Permissions = t.fixPerm(item.rights.user) + t.fixPerm(item.rights.group) + t.fixPerm(item.rights.other);
                        newItem.Owner = item.owner;
                        newItem.Group = item.group;
                        if (item.type == 'd')
                            newItem.type = "folder";
                        else if (item.type == 'l')
                            newItem.type = "link";
                        else
                            newItem.type = "file";
                        newlist.push(newItem);
                    });
                    if (!newlist.length) {
                        let newItem;
                        newItem = {};
                        newItem.Name = "";
                        newItem.Size = "";
                        newItem.Date = "";
                        newItem.Permissions = "";
                        newItem.Owner = "";
                        newItem.Group = "";
                        newItem.type = "";
                        newlist.push(newItem);
                    }
                    let response;
                    response = {};
                    response.code = 250;
                    response.message = "250 List completed successfully.";
                    response.data = newlist;
                    resolve(response);
                }).catch(err => {
                    reject(err);
                });
            }
            else {
                this.ftpclient.list(command).then(list => {
                    resolve(list);
                }).catch(err => {
                    reject(err);
                });
            }
        });
    }
    setAutoMode(option) {
        if (option.transferMode === 'auto') {
            this.autoMode = Object.assign(this.autoMode, option);
        }
        else {
            this.autoMode = { mode: option.transferMode };
        }
    }
    /**
     * returns 'binary' or 'ascii' according to file extension
     * @param fileName
     */
    getAutoMode(fileName) {
        const mode = this.autoMode['mode'];
        if (!mode)
            return TRANSFER_MODE.BINARY; // return default value if autoMode is not provided from frontend
        let choices; // Set choices according to autoMode configuration from frontend
        if (mode.toUpperCase() === 'ASCII') {
            choices = [TRANSFER_MODE.ASCII, TRANSFER_MODE.BINARY];
        }
        else {
            choices = [TRANSFER_MODE.BINARY, TRANSFER_MODE.ASCII];
        }
        let idx = 0;
        const exceptions = this.autoMode['exceptions'];
        if (exceptions && Array.isArray(exceptions)) {
            const tokens = fileName.split('.');
            const ext = (tokens.pop() || '').toUpperCase();
            for (let i = 0; i < exceptions.length; i++) {
                if (ext === exceptions[i].toUpperCase()) { // If the file extension is in exception list, choose the 1, otherwise choose 0
                    idx = 1;
                    break;
                }
            }
        }
        return choices[idx];
    }
    async PerformDownLoad(option) {
        const _this = this;
        const remotePath = option.remotePath;
        this.setAutoMode(option.autoMode);
        this.logInfo('DownLoad', 'start downloading ' + option.type + ': ' + remotePath);
        // if(type === 'folder') {
        //   return this.PerformDownLoadFolder(remotePath);
        // }
        const loadws = this.loadws;
        if (this.loadws.readyState === 1) {
            this.loadws.send(JSON.stringify({ name: remotePath, type: 'start download', isFolder: option.type === 'folder' }));
        }
        else {
            this.logWarn('DownLoad', 'WebSocket is not open: readyState ' + this.loadws.readyState);
        }
        // const stream = websocketStream(loadws, {
        //   // websocket-stream options here
        //   binary: true,
        // });
        // stream.on('finish', () => {
        //   this.logger.debug('download stream finish');
        // });
        // stream.on('close', () => {
        //   this.logger.debug('download stream close');
        // });
        const outStream = new stream_1.Writable({
            write(chunk, encoding, callback) {
                // console.log("outStream write: " + chunk.toString());
                _this.logVerbose('outStream.write', 'chunk recieved: ' + chunk.length);
                if (!loadws) {
                    // console.log("loadws is null");
                    throw 'The download web socket is ' + loadws;
                }
                else {
                    if (loadws.readyState !== loadws.OPEN) {
                        callback();
                        return;
                    }
                    //if (coerceToBuffer && typeof chunk === 'string') {
                    //  chunk = Buffer.from(chunk, 'utf8')
                    //}
                    if (loadws.readyState === 1) {
                        loadws.send(chunk, callback);
                    }
                    else {
                        _this.logWarn('outStream.write', 'WebSocket is not open: readyState ' + loadws.readyState);
                        callback();
                    }
                }
                // // Back presure to basic-ftp. This should be done in basic-ftp instead, it should back presure to ftp host.
                // if (outStream.writableLength > outStream.writableHighWaterMark){
                //   return false;
                // }
                // return true;
            }
        });
        outStream.on('drain', () => {
            this.logDebug('Download', 'outStream drain triggered.');
        });
        const send = (remotePath, type, reason) => {
            if (this.loadws && this.loadws.readyState < 2) { //2 closing, 3 closed
                let sendType = type || 'end download';
                const sendContent = { name: remotePath, type: sendType };
                if (reason) {
                    sendContent['reason'] = reason;
                }
                if (this.loadws.readyState === 1) {
                    this.loadws.send(JSON.stringify(sendContent));
                }
                else {
                    this.logWarn('outStream.write', 'WebSocket is not open: readyState ' + this.loadws.readyState);
                }
            }
        };
        const endDw = (type, reason) => {
            if (!reason) {
                this.logInfo('endDw', 'done with downloading: ' + remotePath);
            }
            if (!outStream.writable) {
                send(remotePath, type, reason);
            }
            else {
                outStream.write('', () => {
                    send(remotePath, type, reason); // make sure the end download is sent after all data packages
                });
            }
        };
        const handleSftpError = (err, reject) => {
            this.logWarn('handleSftpError', err);
            err.originalCode = err.code;
            err.code = SFTP_ERROR_CODE_GENERAL; // The ssh2_sftp_client doesn't return a error code as number. So, we set it as 555.
            reject(err);
            endDw('abort download', err);
        };
        return new Promise((resolve, reject) => {
            if (this.sftpclient) {
                if (option.type === 'file') {
                    // console.log(remotePath);
                    // console.log(this.fullPath(remotePath));
                    let mode;
                    if (!this.transferMode)
                        mode = "utf-8";
                    else
                        mode = null;
                    this.sftpclient.get(this.fullPath(remotePath), outStream, { encoding: mode }).then(result => {
                        //console.log(stream, stream.read(), 'websocketStream');
                        resolve({ code: 226, message: '226 Transfer complete.' });
                        endDw();
                    }).catch(err => {
                        handleSftpError(err, reject);
                    });
                }
                else if (option.type === 'folder') {
                    this.archiveDir(this.sftpclient, outStream, this.fullPath(remotePath)).then(result => {
                        //console.log(stream, stream.read(), 'websocketStream');
                    }).catch(err => {
                        handleSftpError(err, reject);
                    });
                    outStream.on('finish', () => {
                        this.logInfo('Download', `Finished downloading folder ${remotePath}`);
                        resolve({ code: 226, message: '226 Transfer complete.' });
                        endDw();
                    });
                }
                else {
                    const msg = 'Unknown download type: ' + option.type;
                    reject(msg);
                    endDw('abort download', msg);
                }
            }
            else if (option.type === 'file') {
                this.ftpclient.downloadTo(outStream, remotePath).then(result => {
                    this.logDebug('Download', 'download file ' + remotePath + ' return: ' + result);
                    resolve(result);
                    // Should handle all kinds of download errors here.
                    // For list of FPT server return codes, refer to https://en.wikipedia.org/wiki/List_of_FTP_server_return_codes
                    if (result.code >= 300) {
                        this.logWarn('DownLoad', 'Downloading failed : ' + result.message);
                        endDw('abort download', result);
                    }
                    else {
                        endDw();
                    }
                }).catch(err => {
                    this.logWarn('DownLoad', 'Downloading failed : ' + err.message);
                    reject(err);
                    endDw('abort download', err);
                });
            }
            else if (option.type === 'folder') {
                outStream.on('finish', () => {
                    this.logDebug('DownLoad', 'FTP folder downloading stream finished');
                    endDw();
                });
                this.ftpclient.archiveDir(outStream, this.autoMode, remotePath).then(result => {
                    this.logDebug('DownLoad', 'FTP download folder ' + remotePath + ' return: ' + result);
                    resolve(result);
                    // endDw(); // The archiveDir function close the outStream before here. So, this line is invoked in stream finish event
                }).catch(err => {
                    this.logWarn('DownLoad', 'downloading folder ' + remotePath + ' failed : ' + err.message);
                    reject(err);
                    endDw('abort download', err);
                });
            }
            else {
                const msg = 'Unknown download type: ' + option.type;
                reject(msg);
                endDw('abort download', msg);
            }
        });
    }
    // TDB only support upload one file now.
    async PerformUpLoad(data, remotePath) {
        this.logInfo('UpLoad', data);
        var p = Promise.resolve(); // Q() in q
        // this.uploads.forEach(d => {
        //   p = p.then(() =>{
        //     const stream = new Readable();
        //     const buffer = new Buffer(d.data, 'base64')
        //     stream.push(buffer);
        //     remotePath = d.name;
        //     stream.push(null);
        //     if (this.sftpclient) {
        //       console.log(remotePath);
        //       console.log(this.fullPath(remotePath));
        //       let mode;
        //       if ( !this.transferMode )
        //         mode = "utf-8"
        //       else
        //         mode = null;
        //       return this.sftpclient.put(stream, this.fullPath(remotePath), {encoding: mode});
        //     }
        //     else {
        //       return this.ftpclient.uploadFrom(stream, remotePath);
        //     }
        //   }); 
        // });
        return p;
    }
    async ExplicitTLS(certificateAction, alternatePrincipleName, tlsMinVersion, tlsMaxVersion) {
        var t = this;
        this.logDebug('ExplicitTLS', 'Invoked');
        var promptOrAcceptCertificate = function (servername, certificate) {
            t.logDebug('ExplicitTLS', 'Creating server fingerprint. server=' + servername + ', certificate=' + certificate);
            var fingerprintHash = crypto.createHash('sha256');
            fingerprintHash.update(certificate.raw);
            var hex = fingerprintHash.digest('hex');
            var fingerprint = '';
            for (var i = 0; i < hex.length - 1;) {
                fingerprint += hex.substring(i, i + 2) + ':';
                i = i + 2;
            }
            fingerprint = fingerprint.substring(0, fingerprint.length - 1);
            t.logDebug('ExplicitTLS', 'Checking if certificate is OK. Fingerprint=' + fingerprint);
            if (certificateAction != SECURITY_BAD_CERTIFICATE_ALLOW) {
                t.awaitingCertificateVerification = true;
                // In case of certificate chain, the certificate.issuerCertificate is a circular (includes itself circularly). 
                // A circular object will raise exception when it's stringified. 
                // To avoid exception, the issuerCertificate is removed from certificate of tls. 
                let certcopy = Object.assign({}, certificate);
                if (certcopy && certcopy.issuerCertificate) {
                    delete certcopy.issuerCertificate;
                }
                const str = JSON.stringify({
                    t: 'CERT_PROMPT',
                    fp: fingerprint,
                    o: certcopy
                });
                //ws.send(str);
                t.wsSend(t.ws, str);
            }
            return undefined;
        };
        var rejectUnauthorized = ((typeof certificateAction == 'number') && certificateAction == SECURITY_BAD_CERTIFICATE_ALLOW) ? false : true;
        var connectOptions;
        connectOptions = {
            rejectUnauthorized: rejectUnauthorized //True casues rejection of certs if the CA cannot handle them. For example, self-signed exceptions are thrown
        };
        /*
          With CAs, this will be called. It must return either undefined if allowed, or throw if not allowed, so it cannot be async. Instead we set up the server to buffer messages while the user is prompted if needed.
        */
        if (rejectUnauthorized) {
            connectOptions.checkServerIdentity = promptOrAcceptCertificate;
        }
        var securityObjects = g_securityObjects;
        if (securityObjects) {
            if (securityObjects.ca) {
                connectOptions.ca = securityObjects.ca;
            }
            if (securityObjects.crl) {
                connectOptions.crl = securityObjects.crl;
            }
        }
        connectOptions.minVersion = tlsMinVersion;
        connectOptions.maxVersion = tlsMaxVersion;
        connectOptions.servername = alternatePrincipleName;
        t.logDebug('ExplicitTLS', 'ExplicitTLS2');
        return new Promise((resolve, reject) => {
            this.ftpclient.useTLS(connectOptions).then(res => {
                t.logDebug('ExplicitTLS', 'ExplicitTLS2');
                resolve(res);
            }).catch(err => {
                t.logDebug('ExplicitTLS', 'ExplicitTLS3');
                reject(err);
            });
        });
    }
    async connect(host, port, ws, sessionType, username, password, hostdir, certificateAction, alternatePrincipleName, keepAliveTimerOptions, keepAliveTimerValue, tlsMinVersion, tlsMaxVersion) {
        var t = this;
        let pw;
        if ((password) && (password.length > 0))
            pw = true;
        else
            pw = false;
        this.logInfo('connect', host + ":" + port + ", sessionType: " + sessionType + ", username: " + username + ", pw: " + pw + ", hostdir: " + hostdir);
        /*
            let auth = 0;
            var authHandler = function(methodsLeft, partialSuccess, callback) {
              console.log("authHandler: " + methodsLeft);
              console.log("partialSuccess: " + partialSuccess);
              //let authMethods = ['none', 'password', 'publickey', 'agent', 'keyboard-interactive', 'hostbased'];
              let authMethods = ['none', 'password', 'keyboard-interactive'];
              if ( auth < authMethods.length)
                callback(authMethods[auth++]);
              else {
                return;
              }
            }
        */
        var promptOrAcceptCertificate = function (servername, certificate) {
            t.logDebug('promptOrAcceptCertificate', 'Creating server fingerprint. server=' + servername + ', certificate=' + certificate);
            var fingerprintHash = crypto.createHash('sha256');
            fingerprintHash.update(certificate.raw);
            var hex = fingerprintHash.digest('hex');
            var fingerprint = '';
            for (var i = 0; i < hex.length - 1;) {
                fingerprint += hex.substring(i, i + 2) + ':';
                i = i + 2;
            }
            fingerprint = fingerprint.substring(0, fingerprint.length - 1);
            t.logDebug('promptOrAcceptCertificate', 'Checking if certificate is OK. Fingerprint=' + fingerprint);
            if (certificateAction != SECURITY_BAD_CERTIFICATE_ALLOW) {
                t.awaitingCertificateVerification = true;
                // In case of certificate chain, the certificate.issuerCertificate is a circular (includes itself circularly). 
                // A circular object will raise exception when it's stringified. 
                // To avoid exception, the issuerCertificate is removed from certificate of tls. 
                let certcopy = Object.assign({}, certificate);
                if (certcopy && certcopy.issuerCertificate) {
                    delete certcopy.issuerCertificate;
                }
                const str = JSON.stringify({
                    t: 'CERT_PROMPT',
                    fp: fingerprint,
                    o: certcopy
                });
                if (ws.readyState === 1) {
                    ws.send(str);
                }
                else {
                    this.logWarn('promptOrAcceptCertificate', 'WebSocket is not open: readyState ' + ws.readyState);
                }
            }
            return undefined;
        };
        var result;
        if (sessionType === "FTP") {
            return new Promise((resolve, reject) => {
                this.ftpclient.connect(host, port, keepAliveTimerOptions, keepAliveTimerValue).then(res => {
                    var timeoutTimer = setInterval(() => {
                        if ((this.hostConnected) && (this.ftpclient.closed)) {
                            //The ftp session is closed, notify tecore
                            this.hostConnected = false;
                            result = {};
                            result.t = "CLOSED";
                            result.error = this.ftpclient.ftp._closingError;
                            result.error.code = result.error.code === 'ECONNRESET' ? 10054 : result.error.code;
                            var stringReply = JSON.stringify(result);
                            this.wsSend(this.ws, stringReply);
                            this.logInfo('connect', 'FTP connection timed out.');
                            clearInterval(timeoutTimer);
                        }
                    }, 1);
                    resolve(res);
                }).catch(err => {
                    this.logWarn('connect', 'FTP connect failed with error: ' + err);
                    reject(err);
                });
            });
        }
        else if (sessionType == "FTPS") {
            var rejectUnauthorized = ((typeof certificateAction == 'number') && certificateAction == SECURITY_BAD_CERTIFICATE_ALLOW) ? false : true;
            var connectOptions;
            connectOptions = {
                rejectUnauthorized: rejectUnauthorized //True casues rejection of certs if the CA cannot handle them. For example, self-signed exceptions are thrown
            };
            /*
              With CAs, this will be called. It must return either undefined if allowed, or throw if not allowed, so it cannot be async. Instead we set up the server to buffer messages while the user is prompted if needed.
            */
            if (rejectUnauthorized) {
                connectOptions.checkServerIdentity = promptOrAcceptCertificate;
            }
            var securityObjects = g_securityObjects;
            if (securityObjects) {
                if (securityObjects.ca) {
                    connectOptions.ca = securityObjects.ca;
                }
                if (securityObjects.crl) {
                    connectOptions.crl = securityObjects.crl;
                }
            }
            connectOptions.minVersion = tlsMinVersion;
            connectOptions.maxVersion = tlsMaxVersion;
            connectOptions.servername = alternatePrincipleName;
            return new Promise((resolve, reject) => {
                this.ftpclient.connectImplicitTLS(host, port, connectOptions, keepAliveTimerOptions, keepAliveTimerValue).then(res => {
                    if (res.code && res.code === 500) {
                        const closeEvent = {
                            code: 500,
                            message: 'Failed establishing Implicit TLS connection to FTP server'
                        };
                        this.wsSend(this.ws, JSON.stringify(closeEvent));
                        reject(closeEvent.message);
                        return;
                    }
                    var timeoutTimer = setInterval(() => {
                        if ((this.hostConnected) && (this.ftpclient.closed)) {
                            //The ftp session is closed, notify tecore
                            this.hostConnected = false;
                            result = {};
                            result.t = "CLOSED";
                            result.error = this.ftpclient.ftp._closingError;
                            var stringReply = JSON.stringify(result);
                            this.wsSend(this.ws, stringReply);
                            clearInterval(timeoutTimer);
                        }
                    }, 1);
                    resolve(res);
                }).catch(err => {
                    reject(err);
                });
            });
        }
        else if (sessionType == "FTPES") {
            return new Promise((resolve, reject) => {
                this.ftpclient.connect(host, port, keepAliveTimerOptions, keepAliveTimerValue).then(res => {
                    var timeoutTimer = setInterval(() => {
                        if ((this.hostConnected) && (this.ftpclient.closed)) {
                            //The ftp session is closed, notify tecore
                            this.hostConnected = false;
                            result = {};
                            result.t = "CLOSED";
                            result.error = this.ftpclient.ftp._closingError;
                            var stringReply = JSON.stringify(result);
                            this.wsSend(this.ws, stringReply);
                            clearInterval(timeoutTimer);
                        }
                    }, 1);
                    resolve(res);
                }).catch(err => {
                    reject(err);
                });
            });
        }
        else if (sessionType == "SFTP") {
            var config;
            config = {};
            config.host = host;
            config.port = port;
            config.username = username;
            config.password = password;
            //config.tryKeyboard = true;
            //config.authHandler = authHandler;
            if (keepAliveTimerOptions > 0) {
                config.keepaliveInterval = keepAliveTimerValue * 1000 * 60; //convert minutes to ms
            }
            // config.debug = console.log; // JERRY TBD: should redirect to the logger, so the log level can be controled.
            config.debug = this.isDebugEnabled() ? this.logger.debug.bind(this.logger) : null;
            return new Promise((resolve, reject) => {
                this.sftpclient.connect(config).then(() => {
                    resolve({ code: 220, message: "Connected" });
                }).catch(err => {
                    //The sftp session failed to connect, notify tecore
                    let result;
                    result = {};
                    result.t = "CLOSED";
                    this.logWarn('connect', err.message);
                    err.message = err.message.split("after 1 attempt")[0];
                    result.error = { "code": 530, "message": err.message };
                    var stringReply = JSON.stringify(result);
                    this.wsSend(this.ws, stringReply);
                    reject(err);
                });
            });
        }
        this.logInfo('connect return', JSON.stringify(result));
        return result;
    }
    ;
}
var ftpMessageConfig = {
    hostTypeKey: 'FTP_HOST_MESSAGE',
    hostDataKey: 'B64',
    clientTypeKey: 'FTP_CLIENT_MESSAGE',
    clientDataKey: 'data'
};
// var handlerModules: any;
// let scanAndImportHandlers = function(logger) {
//   if (handlerModules == null) {
//     handlerModules = [];
//     let filenames = fs.readdirSync(__dirname);
//     let len = filenames.length;
//     for (let i = 0; i < len; i++) {
//       let filename = filenames[i];
//       if (filename.endsWith('.js') && (filename != 'terminalProxy.js') && (filename != 'ssh.js')) {
//         try {
//           let module = require('./'+filename);
//           if (typeof module.handleClientMessage == 'function'){
//             logger.info(this.szUID+'Found and loaded compatible handler file /lib/'+filename);            
//             handlerModules.push(module);
//           }
//         } catch (e) {
//           logger.warn('Could not load a handler from file /lib/'+filename);
//         }
//       }
//     }
//   }
//   return handlerModules;
// };
// Counts the active FTP sessions
const connCounter = new j_counter_1.JCounter();
/**
 * Stores the loadws for each session. One session could have multiple loadws.
 * Each loadws has a lifecycle, if it's not used by command ws in 5 minutes, it will be cleared.
 */
class WsStore {
    constructor() {
        // The map to store load ws
        this._sessionStore = new Map();
        this._sessionStore = new Map();
    }
    /**
     * Records a ws for given session
     * @param sessionId
     * @param loadws
     */
    push(sessionId, loadws) {
        const wsData = this._sessionStore.get(sessionId) || new Map();
        // Sets id for the load ws
        let wsId = Date.now();
        let offset = 0.01;
        while (wsData.has(wsId)) {
            // So, at the same millisecond, it received multiple load ws connections for the same session Id. 
            // This is not likely to happend, but we still handle it here for safty.
            wsId = wsId + offset;
            offset = offset + 0.01; // So, at the same millisecond, for the same session, there could be 100 load ws. It should be enough even for none auth.
        }
        loadws['id'] = wsId;
        // Temporarily stores the downloading ws in map.
        wsData.set(wsId, loadws);
        this._sessionStore.set(sessionId, wsData);
        // Auto clears the loadWs if it's not used in 5 minutes.
        const wsDeleting = setTimeout(() => {
            const wsData = this._sessionStore.get(sessionId);
            if (wsData && wsData.has(wsId)) {
                wsData.delete(wsId);
                if (wsData.size === 0) {
                    this._sessionStore.delete(sessionId); // Deletes empty maps to release the memory.
                }
            }
        }, 300000);
        loadws['wsDeleting'] = wsDeleting; // So that the timeout itself can be cleared.
    }
    /**
     * Gets a load ws for a given session id. Clears the data accordingly.
     * @param sessionId
     * @returns ws if found, null if not found
     */
    pop(sessionId) {
        const wsData = this._sessionStore.get(sessionId);
        let loadws = null;
        if (wsData && wsData.size > 0) {
            const wsId = Array.from(wsData.keys())[0]; // Gets the 1st key of the map
            if (wsId) {
                loadws = wsData.get(wsId); // Gets the load ws
                if (!loadws)
                    return null; // Should never happen, but need trick with typescript compiler...
                wsData.delete(wsId); // Deletes the load ws as it's already poped out.
                clearTimeout(loadws['wsDeleting']); // Clears the timeout which automatically deletes the load ws in 5 min. No need to do the auto delete anymore.
            }
        }
        if (wsData && wsData.size === 0) {
            this._sessionStore.delete(sessionId); // Deletes empty maps to release the memory.
        }
        return loadws;
    }
}
function ftpRouter(context) {
    // let handlers = scanAndImportHandlers(context.logger);
    let router = express_1.default.Router();
    if (!router.ws) {
        const express = require('express');
        router = express();
        const expressWs = require('express-ws')(router);
    }
    return new Promise(function (resolve, reject) {
        let securityConfig = context.plugin.server.config.user.node;
        if (securityConfig && !g_securityObjects) {
            createSecurityObjects(securityConfig, context.logger);
        }
        const wsStore = new WsStore();
        /**
         * ignorePingPongTimer:
         *  1. null: check pingPong
         *  2. always: ignore pingPong
         *  3. timestamp: ignore pingPong within 2 hours
         *
         */
        router.ws('/download', function (ws, req) {
            context.logger.info('Saw Websocket request for downloading, method=' + req.method);
            const sesId = req.sessionID;
            ws.ignorePingPongTimer = 'always';
            context.logger.debug(`Received ftp load ws from session: ${sesId}`);
            wsStore.push(sesId, ws);
        });
        router.ws('/', function (ws, req) {
            context.logger.info('Saw Websocket request for ftp connection, method=' + req.method);
            const ip = req.headers['x-forwarded-for'] || req.ip;
            const sesId = req.sessionID;
            context.logger.debug(`Received ftp command ws from session: ${sesId}`);
            const loadws = wsStore.pop(sesId); // Gets the load ws
            if (loadws) {
                new FTPWebsocketProxy(ftpMessageConfig, ip, context, ws, loadws, connCounter);
                //this is a new connection, this must make a BRAND NEW INSTANCE!!!
            }
            else {
                // This is abnormal case, if load ws doesn't exists, FTP function won't work correctly. So report the issue to frontend.
                context.logger.error(`Load ws not found for session: ${sesId}, Client IP: ${ip}`);
                ws.close(WEBSOCKET_REASON_TERMPROXY_INTERNAL_ERROR, 'Downloading ws connection not found');
            }
        });
        resolve(router);
    });
}
exports.ftpRouter = ftpRouter;
;
//# sourceMappingURL=ftp-controller.js.map