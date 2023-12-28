const fs = require('fs-extra');
const path = require('path');
const Utils = require('../utils.service');

const IMPORT_LOG_PREFIX = '[import]';

class ImportLogger {
  constructor(zluxlogger) {
    this.zluxlogger = zluxlogger;
    this.isValid = false;
    this.ws = null;
  }

  setLogFile(filepath) {
    const utils = new Utils();
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      try {
        utils.createDirs(dir);
      } catch (e) {
        this.isValid = false;
        return;
      }
    }
    this.isValid = true;
    if (this.ws) {
      this.ws.end();
    }
    this.ws = fs.createWriteStream(filepath, {flags: 'a', encoding: 'utf8', mode: 0o644});
  }

  async log(level, msg) {
    if (!this.isValid) return;
    
    const now = new Date();
    now.setTime(now.getTime() - now.getTimezoneOffset() * 60000);
    let nowStr = now.toISOString();
    nowStr = nowStr.substring(0, nowStr.length - 1).replace('T',' ');
    const data = `[${nowStr} ${level}] - ${msg}\n`;

    if (!this.ws.write(data)) {
      await new Promise(resolve => this.ws.once('drain', resolve));
    }
  }

  debug(msg) {
    this.zluxlogger.debug(`${IMPORT_LOG_PREFIX} ${msg}`);
  }

  info(msg) {
    this.zluxlogger.info(`${IMPORT_LOG_PREFIX} ${msg}`);
    if (this.isValid) this.log('INFO', msg);
  }

  warn(msg) {
    this.zluxlogger.warn(`${IMPORT_LOG_PREFIX} ${msg}`);
    if (this.isValid) this.log('WARNING', msg);
  }

  severe(msg) {
    this.zluxlogger.severe(`${IMPORT_LOG_PREFIX} ${msg}`);
    if (this.isValid) this.log('SEVERE', msg);
  }

} // end class

module.exports = ImportLogger;