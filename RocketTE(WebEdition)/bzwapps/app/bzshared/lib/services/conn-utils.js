// const ip = require('ip');
const os = require('os');

class ConnUtils {

  getUpgradeMetaEntity() {
    return '_metadata_upgrade';
  }

  getLocalIp() {
    if(process.env.RTEW_CLUSTER_PROXY_HOSTNAME) {
      // use pod index as part of dynamic data entity
      const proxyHostname = process.env.RTEW_CLUSTER_PROXY_HOSTNAME;
      const hostname = proxyHostname ? (proxyHostname === 'RTEW_OS_HOSTNAME'? os.hostname(): proxyHostname) : undefined;

      return hostname;
    }

    const clientIp = Object.values(os.networkInterfaces())
      .flat()
      .filter((item) => !item.internal && (item.family === "IPv4" || item.family === 4))
      .find(Boolean).address;
    // console.log('clientIP', clientIp);
    return clientIp || '0.0.0.0';
  }

  // truncServerId(id) {
  //   return id.slice(-4);
  // }

  /**
   * return the last two section
   * in watchFileMode: add port into localIp, nornal mode: no port in it
   * @param {*} localIp 
   * @returns string // keep the last two section
   */
  truncLocalIp(localIp) {
    if (!localIp) localIp = this.getLocalIp();

    if(process.env.RTEW_CLUSTER_PROXY_HOSTNAME) {
      return localIp;
    }

    // IPV4: '.'   IPV6: ':'
    const symbol = localIp.indexOf('.') ? '.' : (localIp.indexOf(':') ? ':' : ' ');
    const ipSections = localIp.split(symbol);
    const getHex = (strNum) => (Number(strNum) || 0).toString(16);
    const l = ipSections.length;

    if(l.length < 2) {
      return `${getHex(ipSections[0])}}`;
    }

    return `${getHex(ipSections[l - 2])}$${getHex(ipSections[l - 1])}`;
  }

  /**
   * If url is a full url path which contains protocol, hostname and port, it return url path
   * if url only contains hostname and port, return hostname and port
   * if url only contains hostname, return hostname.
   * @param {*} url 
   * @returns url string
   */
  getServerNameFromUrl(url) {
    try {
      const serverUrl = new URL(url);
      return serverUrl.hostname || url; // add port into watch file mode, then it will return empty and we should get original url
    } catch(err) {
      return url;
    }
   
  }

  getConnItems(inputObj) {
    return inputObj && inputObj.data && inputObj.data.data || [];
  }

  findObjMaxValue(obj) {
    let result = {
      key: '',
      value: 0
    };

    Object.keys(obj).forEach(key => {
      const item = obj[key] || {uc: 0};
      if (!result.key || (result.value < item.uc) || (result.value === item.uc && Number(result.key) < item.t)) {
        result.key = item.t;
        result.value = item.uc;
      }
    });
    return result;
  }

  ensureTens(num) {
    return num < 10 ? `0${num}` : num;
  }

  getDate(dateObj) {
    if (!dateObj) dateObj = new Date();
    const year = dateObj.getFullYear();
    const month = this.ensureTens(dateObj.getMonth() + 1);  // getMonth() return 0-11
    const day = this.ensureTens(dateObj.getDate());   // getDate() return 1-31
    return `${year}${month}${day}`;
  }

  getTime(dateObj, withSecond) {
    const hour = this.ensureTens(dateObj.getHours());
    const minute = this.ensureTens(dateObj.getMinutes());
    const second = withSecond ? this.ensureTens(dateObj.getSeconds()) : '';
    return `${hour}${minute}${second}`;
  }

  getDateTime(dateObj) {
    const date = this.getDate(dateObj);
    const time = this.getTime(dateObj);
    return `${date}${time}`;
  }

  getUTCDate(dateObj) {
    const year = dateObj.getUTCFullYear();
    const month = this.ensureTens(dateObj.getUTCMonth() + 1);  // getMonth() return 0-11
    const day = this.ensureTens(dateObj.getUTCDate());   // getDate() return 1-31
    return `${year}${month}${day}`;
  }

  getUTCTime(dateObj, withSecond, withMillisecond) {
    const hour = this.ensureTens(dateObj.getUTCHours());
    const minute = this.ensureTens(dateObj.getUTCMinutes());
    const second = withSecond ? this.ensureTens(dateObj.getUTCSeconds()) : '';
    const millisecond = withMillisecond ? dateObj.getUTCMilliseconds() : '';
    return `${hour}${minute}${second}${millisecond}`;
  }

  getUTCDateTime(dateObj) {
    const date = this.getUTCDate(dateObj);
    const time = this.getUTCTime(dateObj);
    return `${date}${time}`;
  }

  getHourInterval() {
    return 60 * 60 * 1000;
  }

  getDayInterval() {
    return 24 * this.getHourInterval();
  }

  getSampleInterval(sampleInterval) {   // minutes
    return sampleInterval * 60 * 1000;
  }

  getDailyInterval() {
    const date = new Date();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    return (hour * 60 * 60 + minute * 60 + second) * 1000;
  }

  getDeviationInterval(date, sampleInterval) {    // sampleInterval: minutes
    const minute = date.getMinutes();
    // const second = date.getSeconds(); // ignore seconds
    const deviation = ((minute % sampleInterval) * 60) * 1000;
    return deviation;
  }

  getUtcInterval(period) {
    const dayInterval = this.getDayInterval();
    if (period === 'h1') {
      return 1 * this.getHourInterval();
    } else if (period === 'd1') {
      return dayInterval;
    } else if (period === 'd3') {
      return 3 * dayInterval;
    } else if (period === 'w1') {
      return 7 * dayInterval;
    } else if (period === 'w2') {
      return 14 * dayInterval;
    } else if (period === 'daily') {
      return this.getDailyInterval();
    }
  }

  getDateRange(count) {
    let result = [];
    const ct = (new Date()).getTime();
    for (let i = 0; i < count; i++) {
      const t = ct - i * this.getDayInterval();
      const date = this.getDate(new Date(t));
      result.push(date);
    }
    return result;
  }

  // _getExceedDate(maxDays, delta) {
  //   let result = [];
  //   const ct = (new Date()).getTime();
  //   delta = delta ? delta : 1;
  //   for (let i = 0; i < delta; i++) {
  //     const t = ct - (maxDays + 1 + i) * this.getDayInterval();
  //     const date = this.getDate(new Date(t));
  //     result.push(date);
  //   }
    
  //   if (result.length === 1) return result[0];
  //   return result;
  // }

  getExceedDate(maxDays, delta) {
    let result = [];
    const ct = (new Date()).getTime();
    delta = delta ? delta : 1;
    for (let i = 0; i < delta; i++) {
      const t = ct - (maxDays + i) * this.getDayInterval();
      const date = this.getDate(new Date(t));
      result.push(date);
    }
    
    // if (result.length === 1) return result[0];
    return result;
  }

  getPeriodDate(period) {
    let dateCount = 1;
    if (period === 'h1') {
      dateCount += 1;
    } else if (period === 'd1') {
      dateCount += 1;
    } else if (period === 'd3') {
      dateCount += 3;
    } else if (period === 'w1') {
      dateCount += 7;
    } else if (period === 'w2') {
      dateCount += 14;
    } else if (period === 'daily') {
      dateCount += 1;
    } else if (typeof period === 'number') {   // the specify date
      return period;
    }
    return this.getDateRange(dateCount);
  }

  /**
 * 
 * @param {*} dateObj an entity of Date class
 * @param {boolean} withTime if return with time
 * @returns 
 * 1. without time: string of the date value in "MM/DD/YYYY" format. e.g. 05/21/2020 for May. 21th, 2020
 * 2. with time: string of the date value in "hh:mm:ss MM/DD/YYYY" format eg. 17:07:39 05/21/2020
 */
  formatDate(dateObj, withTime, withSecond, formater='mm/dd/yyyy') {
    const year = dateObj.getFullYear();
    const month = this.ensureTens(dateObj.getMonth() + 1);  // getMonth() return 0-11
    const day = this.ensureTens(dateObj.getDate());   // getDate() return 1-31
    const date = formater === 'mm/dd/yyyy' ? `${month}/${day}/${year}` : `${year}/${month}/${day}`;

    if (withTime) {
      const hour = this.ensureTens(dateObj.getHours());
      const minute = this.ensureTens(dateObj.getMinutes());
      const second = this.ensureTens(dateObj.getSeconds());
      const time = withSecond ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
      return `${time} ${date}`;
    }
    return date;
  }

  // [{uid: aa, ip: 127.0.0.1, cid: [1, 5]}, {uid: bb, ip: 127.0.0.1, cid: [4, 6]}]
  aggregateCid(data) {
    let cidObj = {};

    data.forEach(item => {
      const key = item.uid + '$$$' + item.ip;
      if (cidObj[key] == undefined) {
        cidObj[key] = [item.cid];
      } else {
        cidObj[key].push(item.cid);
      }
    });

    return Object.keys(cidObj).map(key => {
      const values = key.split('$$$');
      return {
        uid: values[0],
        ip: values[1],
        cids: cidObj[key]
      };
    }) || [];
  }

  aggregateCidWithUc(data) {
    let cidObj = {};
    let uids = [];

    data.forEach(item => {
      const uid = item.uid;
      const key = uid + '$$$' + item.ip;
      if (uids.indexOf(uid) === -1) uids.push(uid);
      if (cidObj[key] == undefined) {
        cidObj[key] = [item.cid];
      } else {
        cidObj[key].push(item.cid);
      }
    });

    const users = Object.keys(cidObj).map(key => {
      const values = key.split('$$$');
      return {
        uid: values[0],
        ip: values[1],
        cids: cidObj[key]
      };
    }) || [];
    return {
      users,
      uc: uids.length
    };
  }

  /**
 * {
 *   aa: [{uid: aa, ip: 127.0.0.1, cid: [1, 5]}]
 *   bb: [{uid: bb, ip: 127.0.0.1, cid: [4, 6]}]
 * }
 */
    aggregateCidToUserObj(data) {
      let cidObj = {};
  
      data.forEach(item => {
        const key = item.uid + '$$$' + item.ip;
        if (cidObj[key] == undefined) {
          cidObj[key] = [item.cid];
        } else {
          cidObj[key].push(item.cid);
        }
      });
  
      let userObj = {};
  
      Object.keys(cidObj).forEach(key => {
        const values = key.split('$$$');
        if (!userObj[values[0]]) userObj[values[0]] = [];
        userObj[values[0]].push({
          uid: values[0],
          ip: values[1],
          cids: cidObj[key]
        });
      });
  
      return userObj;
    }

    isAutoScaleMode() {
      return process.env.RTEW_CLUSTER_AUTO_SCALING_ENABLED === 'true' && process.env.RTEW_CLUSTER_ENABLED !== 'false';
    }


}

// end class

const utils = new ConnUtils();

module.exports = utils;
