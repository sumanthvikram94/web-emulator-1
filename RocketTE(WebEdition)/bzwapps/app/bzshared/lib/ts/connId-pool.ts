interface IQueue {
  enqueue(item: number): void;
  dequeue(): number;
  size(): number;
  batchEnqueue(): void;
}

class ConnIdPool implements IQueue {
  private storage: number[] = [];
  private bCapacity: number = 20;
  private batchCount: number = 0;

  constructor() { }

  getConnId(): number {
    if (this.size() === 0) {
        this.batchEnqueue();
    }
    return this.dequeue();
}

  enqueue(item: number): void {
    this.storage.push(item);
  }

  dequeue(): number {
    if (this.size() === 0) {
      throw Error("The Queue is empty");
    }

    return this.storage.shift() as number;
  }

  size(): number {
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

export { ConnIdPool }