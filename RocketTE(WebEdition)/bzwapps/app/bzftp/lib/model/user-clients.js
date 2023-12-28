"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserClients = void 0;
;
class UserClients {
    constructor() {
        this.clients = new Map();
    }
    set(userId, clientId, client) {
        if (!this.clients.has(userId))
            this.clients.set(userId, new Map());
        this.clients.get(userId)?.set(clientId, client);
    }
    get(userId, clientId) {
        const userValue = this.clients.get(userId);
        return userValue ? userValue.get(clientId) : undefined;
    }
    destroy(userId, clientId) {
        const userValue = this.clients.get(userId);
        if (userValue) {
            userValue.delete(clientId);
            if (userValue.size === 0) {
                this.clients.delete(userId);
            }
        }
    }
}
exports.UserClients = UserClients;
//# sourceMappingURL=user-clients.js.map