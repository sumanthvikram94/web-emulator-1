"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnIdPool = void 0;
class ConnIdPool {
    constructor() {
        this.storage = [];
        this.bCapacity = 20;
        this.batchCount = 0;
    }
    getConnId() {
        if (this.size() === 0) {
            this.batchEnqueue();
        }
        return this.dequeue();
    }
    enqueue(item) {
        this.storage.push(item);
    }
    dequeue() {
        if (this.size() === 0) {
            throw Error("The Queue is empty");
        }
        return this.storage.shift();
    }
    size() {
        return this.storage.length;
    }
    batchEnqueue() {
        if (this.size() !== 0) {
            throw Error("The Queue is not empty, you cannot do batch enqueue action");
        }
        const batchTotal = this.batchCount * this.bCapacity;
        for (let i = 0; i < this.bCapacity; i++) {
            this.enqueue(batchTotal + i + 1);
        }
        this.batchCount++;
    }
}
exports.ConnIdPool = ConnIdPool;
//# sourceMappingURL=connId-pool.js.map