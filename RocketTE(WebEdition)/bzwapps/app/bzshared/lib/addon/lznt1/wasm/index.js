'use strict'
const lznt1 = require('./lznt1')();

class EmLznt1 {
  constructor() {    
    this.module = lznt1;
    //console.log(lznt1.HEAP8.buffer)
  }

  uncompress( // return Buffer
    buf) // Buffer
  {
    const nSize = buf.length;
    const data = this.module._malloc(nSize + 1);
    this.module.HEAP8.set(buf, data);
    const outSize = 32 * 1024;
    const out = this.module._malloc(outSize);
    const error = this.module._malloc(256)
    const orgSize = this.module.uncompress(data, nSize, out, outSize, error, 256)
    let org = Buffer.from([]);
    if (orgSize >= 0) {
      const orgView = new Uint8Array(this.module.HEAP8.buffer, out, orgSize);
      org = new Uint8Array(orgView);
    }
    this.module._free(data);
    this.module._free(out);
    this.module._free(error);
    return org;
  }
}

module.exports = EmLznt1;