'use strict'
const bz3270 = require('./rte_desktop3270')();
bz3270.Init();
const bz5250 = require('./rte_desktop5250')();
bz5250.Init();
const bzvt = require('./rte_desktopvt')();
bzvt.Init();

class EmRteDesktop {
  constructor(sessionType) {        
    this.sessionType = sessionType;
    if (sessionType === '3270') {
      this.module = bz3270;
    } else if (sessionType === '5250') {
        this.module = bz5250;
    } else if (sessionType === 'VT') {
      this.module = bzvt;
    } else {
      this.module = bz3270;
    }
    // this.module.Init();
  }

  Binary2WebKeyMapping( //return string
    keylabels)  //ArrayBuffer
  {
    const buf = Buffer.from(keylabels);
    const nSize = buf.length;
    const data = this.module._malloc(nSize + 1);
    this.module.HEAP8.set(buf, data);
    const text = this.module.Binary2WebKeyMapping(data, nSize);
    this.module._free(data);
    return text;
  }

  Binary2StringKeyMapping( //return string
    sValue,   //string
    keylabel, //ArrayBuffer
    nType)    //number
  {
    const buf = Buffer.from(keylabel);
    const nSize = buf.length;
    const data = this.module._malloc(nSize + 1);
    this.module.HEAP8.set(buf, data);
    const text = this.module.Binary2StringKeyMapping(sValue, data, nType);
    this.module._free(data);
    return text;
  }

  Binary2ScriptKeyMapping( //return string
    sValue,   //string
    keylabel, //ArrayBuffer
    nType)    //number
  {
    const buf = Buffer.from(keylabel);
    const nSize = buf.length;
    const data = this.module._malloc(nSize + 1);
    this.module.HEAP8.set(buf, data);
    const text = this.module.Binary2ScriptKeyMapping(sValue, data, nType);
    this.module._free(data);
    return text;
  }
  
 Editable2WebKeyMapping(kbdata)   //return json string
  {
    return this.module.Editable2WebKeyMapping(kbdata);
  }  
}

module.exports = EmRteDesktop;