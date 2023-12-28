"use strict";
/**
 * API service for FTP
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FtpService = void 0;
const ftp = __importStar(require("basic-ftp"));
const api_service_abs_1 = require("../common/api-service-abs");
const user_clients_1 = require("../../model/user-clients");
class FtpService extends api_service_abs_1.ApiServiceAbs {
    constructor(context) {
        super(context);
        this.userClients = new user_clients_1.UserClients();
    }
    /**
     * Create a ftp connection
     */
    getDummyText() {
        return 'just a dummy function';
    }
    async createClient(userId, clientId, meta) {
        const client = new ftp.Client();
        client.ftp.verbose = true;
        try {
            await client.access(meta);
            this.userClients.set(userId, clientId, client);
            this.logger.info(`FTP client '${clientId}' created for user: ${userId}`);
        }
        catch (err) {
            this.logger.severe(err);
            client.close();
            throw err;
        }
    }
    async getCurrentStat(userId, clientId) {
        const client = this.getClient(userId, clientId);
        const pwd = await client.pwd();
        const list = await client.list();
        return {
            pwd: pwd,
            list: list
        };
    }
    close(userId, clientId) {
        const client = this.getClient(userId, clientId);
        client.close();
        this.userClients.destroy(userId, clientId);
    }
    getClient(userId, clientId) {
        const client = this.userClients.get(userId, clientId);
        if (!client)
            throw 'FTP connection lost';
        return client;
    }
}
exports.FtpService = FtpService;
;
//# sourceMappingURL=ftp-service.js.map