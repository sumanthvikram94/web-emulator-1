'use strict'

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const Utiles =  require('./utils.service');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const w2h_const = require('../../../bzshared/lib/model/w2h-const'); // BZ-20034, update version to 10.2.0
const UpgradeTo10_1_1 = require('../upgrade/upgradeTo10_1_1.service'); // upgrad to 10.1.1
const UpgradeTo10_1_2 = require('../upgrade/upgradeTo10_1_2.service'); // upgrad to 10.1.2
// no 10.1.3
const UpgradeTo10_1_4 = require('../upgrade/upgradeTo10_1_4.service'); // upgrad to 10.1.4
const UpgradeTo10_2_0 = require('../upgrade/upgradeTo10_2_0.service'); // upgrad to 10.2.0
const UpgradeTo10_2_1 = require('../upgrade/upgradeTo10_2_1.service'); // upgrad to 10.2.1

const V810_USERS_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzadm/users';
const V810_SESSIONS_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzadm/sessions';
const V810_GROUPS_DIR = 'instance/groups';

const GROUP_ID_FILE = 'instance/groups/id_manager.json';
const BZ_PROFILES_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzadm/sessions';
const BZA_CONFIG_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzadm/configurations';
const SESSION_SETTINGS_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';

const BZDB_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzshared/_db_store'
const BZDB_VERSION_FILE = 'product/ZLUX/pluginStorage/com.rs.bzshared/_internal/services/version/version.json'

const BZW2H_GLOBAL_SETTING_FILE = 'instance/ZLUX/pluginStorage/com.rs.bzadm/configurations/web2hServerSettings.json';
const BZW2H_PRODUCT_DIR = 'product/ZLUX/pluginStorage/com.rs.bzw2h'
const BZW2H_INSTANCE_DIR = 'instance/ZLUX/pluginStorage/com.rs.bzw2h'
const BZW2H_SESSION_FOLDER = 'instance/ZLUX/pluginStorage/com.rs.bzadm/sessions'
const BZW2H_GROUP_FOLDER = 'instance/ZLUX/pluginStorage/com.rs.bzw2h/groups'
const BZW2H_DIST_FOLDER = 'product/ZLUX/pluginStorage/com.rs.bzw2h/custom'

const BZ_DEFAULT_DIR = 'product/ZLUX/pluginStorage/com.rs.bzadm/defaults';

class UpgradeDataW2hService {
  
  constructor(context, upgradeService) {
    this.context = context;
    this.logger = context.logger;
    this.upgradeService = upgradeService;
    this.deployDir = path.join(this.context.plugin.server.config.user.rootDir);
    //this.migrateDir = this.deployDir.replace(/deploy$/, 'migrate');
    //this.upgradeService.fixUpgradePath(); //BZ-21512
    this.migrateDir = this.upgradeService.upgradePath;
    this.utiles = new Utiles(context);
    // default privilege in v8.1.1
    this.defaultPriv = {
      createSession: false,
      cloneSession: false,
      removeSession: false,
      editLU: true,                   // 8.1.1, not used by W2H
      sessionSettings: false,
      enableRecorder: false,
      enableUseEditor: false,
      enablePlayScript: false,
      enablePrivateScript: false,
      enableSharedScript: false,
      enableEditSession: false,
      enableEditFontSize: true,
      enableEditColors: true,
      enableEditCursor: true,
      enableShowLaunchPadMenu: false,
      enableEditLaunchPad: true,
      enableEditkeyboardMapping: true,
      enableEditHotSpots: true,
      enableEditLanguage: true,
      enableFTPTransferSetting: true, // 8.1.1
      // advanced setting      
      enableAdvAPISetting: true,      // 8.1.1
      enableAdvLicMg: true,           // 8.1.1
      enableAdvToolbar: true,         // 8.1.1
      enableAdvEditProp: true,        // 8.1.1
      enableAdvStatusbar: true,       // 8.1.1
      enableAdvMacroSetting: true,    // 8.1.1
      enableAdvIND$FILE: true,        // 8.1.1
      enableAdvFileProp: true,        // 8.1.1
      enableAdvScriptSetting: true,   // 8.1.1
      enableAdvPrintScreen: true,     // 8.1.1
      enableAdvPrintQueue: true,      // 8.1.1
      // lock FTP commands
      lockFTPCommands: false,         // 8.1.1
      lockFTPCWD: true,               // 8.1.1
      lockFTPDELE: true,              // 8.1.1
      lockFTPMKD: true,               // 8.1.1
      lockFTPRETR: true,              // 8.1.1
      lockFTPRMD: true,               // 8.1.1
      lockFTPSITE: true,              // 8.1.1
      lockFTPSTOR: true               // 8.1.1
    }
    this.upgradeTo10_1_1 = new UpgradeTo10_1_1(context); // upgrade to 10.1.1
    this.upgradeTo10_1_2 = new UpgradeTo10_1_2(context); // upgrade to 10.1.2
    this.upgradeTo10_1_4 = new UpgradeTo10_1_4(context); // upgrade to 10.1.4
    this.upgradeTo10_2_0 = new UpgradeTo10_2_0(context); // upgrade to 10.2.0
    this.upgradeTo10_2_1 = new UpgradeTo10_2_1(context); // upgrade to 10.2.1
    // this.logger.info('====================');
    // this.logger.info(process.env._BPXK_AUTOCVT);
    // this.logger.info(process.env._TAG_REDIR_ERR);
    // this.logger.info(process.env._TAG_REDIR_IN);
    // this.logger.info(process.env._TAG_REDIR_OUT);
    // this.logger.info(process.env.__UNTAGGED_READ_MODE);
    // this.logger.info('====================');
  }

  /**
   * Name:  getVersion
   * Desc:  load 8.1.0 data entity to BZDB
   */
  getVersion(verDir) {
    const versionPath = path.join(verDir, BZDB_VERSION_FILE)
    // There is an example for version.json file.
    // {
    //   "apiVersion": "8.1.1.3565",
    //   "pluginVersion": "8.1.1.3565"
    // }
    if (fs.existsSync(versionPath)) {
      const data = fse.readJSONSync(versionPath);
      if (data && data.pluginVersion) {
        return data.pluginVersion;
      } else {
        throw new Error('Failed to read the version file.');
      }
    } else {
      return '8.1.0'; // the version.json file is added from 8.1.1
    }
  }

  /**
   * Name:  load810Data2Bzdb
   * Desc:  load 8.1.0 data entity to BZDB
   */
  async load810Data2Bzdb(baseDir, subDir, regex, entityName, entityId) {
    this.logger.info(`== Start to load 8.1.0 entity '${entityName}' from '${subDir}'...`);
    const entityDir = path.join(baseDir, subDir);
    const entityArr = [];
    if (fs.existsSync(entityDir)) {
      const files = fs.readdirSync(entityDir).filter(fn => fn.match(regex));
      for (const file of files) {
        const entityFile = path.join(entityDir, file);
        if (!fs.existsSync(entityFile)) {
          continue;
        }
        let rawData = '';
        let data = {};
        try {
          //const data = fse.readJsonSync(entityFile, 'utf8');
          rawData = fs.readFileSync(entityFile, 'utf8');
          try {
            data = JSON.parse(rawData);
          } catch (e) {
            // BZ-13634, sometimes nodejs reads file using EBCDIC encoding, which caused JSON.parse() failed.
            // Error msg: 'SyntaxError: Unexpected token # in JSON at position 0'
            // We found this parse issue always occurs in the first json file, so we will try to read the same file again to avoid this issue.
            this.logger.severe(`Failed to parse file '${entityFile}' with error '${e}', try again...`);
            rawData = fs.readFileSync(entityFile, 'utf8');
            data = JSON.parse(rawData);
          }
          if ('sessionShared' === entityName) {
            data.id = data.name; // add id
            if (data.bzd && data.bzd.profile && !data.bzd.oriFileName) {
              data.bzd.oriFileName = data.bzd.profile; // set oriFileName
            }
          } else if ('group' === entityName) {
            // group.privileges may be {} in v 8.1.0
            const priv = JSON.parse(JSON.stringify(this.defaultPriv));
            Object.assign(priv, data.privileges || {});
            data.privileges = priv;
          }
          entityArr.push(data);
        } catch (e) {
          this.logger.severe(`Failed to load entity file '${entityFile}' with error '${e}'`);
          this.logger.info(`The raw data is: '${rawData}'`);
        }
      } // end for
      // remove all data
      const dataArr = (await bzdb.select(entityName)).data;
      for (const data of dataArr) {
        const filter = {};
        filter[entityId] = data[entityId];
        await bzdb.delete(entityName, filter);
      }
      // load data to bzdb
      await bzdb.bulkLoad(entityName, entityArr);
    } else {
      this.logger.warn(`The directory of entity '${entityName}' does not exist.`);
    }
    this.logger.info(`== Finished loading 8.1.0 entity '${entityName}', count: {${entityArr.length}}...`);
  }

  /**
   * Name:  migrate810Users
   * Desc:  migrate 8.1.0 users
   */
  async migrate810Users() {
    this.logger.info('== Start to migrate 8.1.0 users...');
    // migrate "login" data
    await this.load810Data2Bzdb(this.migrateDir,
      V810_USERS_DIR,
      /^login_.+\.json$/,
      'userLogin',
      'username');
    // migrate "userInfo" data
    await this.load810Data2Bzdb(this.migrateDir,
      V810_USERS_DIR,
      /^userInfo_.+\.json$/,
      'userInfo',
      'userId');
    this.logger.info('== Finished migrating 8.1.0 users.');
  }

  /**
   * Name:  migrate810Sessions
   * Desc:  migrate 8.1.0 sessions
   */
  async migrate810Sessions() {
    this.logger.info('== Start to migrate 8.1.0 sessions...');
    // migrate "session" data
    const regex = /^session_.+\.json$/;
    await this.load810Data2Bzdb(this.migrateDir,
      V810_SESSIONS_DIR,
      regex,
      'sessionShared',
      'id');
    // copy BZ profiles
    this.copySessionProfiles();
    this.logger.info('== Finished migrating 8.1.0 sessions.');
  }

  /**
   * Name:  copySessionProfiles
   * Desc:  copy BZ profiles
   */
  copySessionProfiles() {
    this.logger.info('== Start to copy session profiles...');
    const regex = /^session_.+\.json$/;
    // copy BZ profiles
    const src = path.join(this.migrateDir, BZ_PROFILES_DIR);
    const dst = path.join(this.deployDir, BZ_PROFILES_DIR);
    function filter(name) {
      return !name.match(regex);
    }
    this.logger.info(`== copying folder '${src}'...`);
    this.utiles.copyDirectory(src, dst, filter); // exclude json file
    this.logger.info('== Finished copying session profiles.');
  }

  /**
   * Name:  migrate810Groups
   * Desc:  migrate 8.1.0 groups
   */
  async migrate810Groups() {
    this.logger.info('== Start to migrate 8.1.0 groups...');
    // migrate "group" data
    await this.load810Data2Bzdb(this.migrateDir,
      V810_GROUPS_DIR,
      /^group_.+\.json$/g,
      'group',
      'id');
    this.copyGroupIdFile();
    this.logger.info('== Finished migrating 8.1.0 groups.');
  }

  copyGroupIdFile() {
    const file = GROUP_ID_FILE;
    this.logger.info(`== copying file '${file}'...`);
    this.utiles.copyFile(path.join(this.migrateDir, file), path.join(this.deployDir, file));
  }

  /**
   * Name:  copySessionSettings
   * Desc:  copy session settings
   */
  copySessionSettings() {
    this.logger.info('== Start to copy session settings...');
    // copy session settings and keyboard mappings
    const rootDir = SESSION_SETTINGS_DIR;
    const dirs = [
      rootDir,
      path.join(rootDir, 'hotspots'),
      path.join(rootDir, 'keyboardmapping'),
      path.join(rootDir, 'launchpad'),
      path.join(rootDir, 'preference')
    ];
    for (const dir of dirs) {
      const src = path.join(this.migrateDir, dir);
      const dst = path.join(this.deployDir, dir);
      this.logger.info(`== copying folder '${src}'...`);
      this.utiles.copyDirectory(src, dst);
    }
    this.logger.info('== Finished copying session settings.');
  }
  deleteSessionSettings() {
    this.logger.info('== Start to delete session settings...');
    const dir = path.join(this.deployDir, SESSION_SETTINGS_DIR);
    this.utiles.rmdirSync(dir);
    this.logger.info('== Finished deleting session settings.');
  }
  
  /**
   * Name:  copyBzaConfig
   * Desc:  copy specific files under 'instance/ZLUX/pluginStorage/com.rs.bzadm/configurations'.
   */
  async copyBzaConfig() {
    this.logger.info('== Start to copy BZA config...');
    await this.upgradeService.upgradeAdminConfig();
    /*const files = [
      `${BZA_CONFIG_DIR}/adminConfig.json`  // 10.1.2
    ];
    for (const file of files) {
      this.logger.info(`== copying file '${file}'...`);
      this.utiles.copyFile(path.join(this.migrateDir, file), path.join(this.deployDir, file));
    }*/
    this.logger.info('== Finished copying BZA config.');
  }

  /**
   * Name:  copyAuthConfig
   * Desc:  copy config files for different auth, such as LDAP, MSSQL, SSO and etc.
   */
  copyAuthConfig() {
    this.logger.info('== Start to copy auth config...');
    const files = [
      'instance/ZLUX/pluginStorage/com.rs.bzadm/configurations/dataSourceSetting.json',
      'instance/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json', // used by 'user-privilege-controller.js'
      'instance/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin/ldapServerConfig.json',
      'instance/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin/msSQLServerConfig.json',
      'instance/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin/ssoServerConfig.json'
    ];
    for (const file of files) {
      this.logger.info(`== copying file '${file}'...`);
      this.utiles.copyFile(path.join(this.migrateDir, file), path.join(this.deployDir, file));
    }
    this.logger.info('== Finished copying auth config.');
  }

  deleteAuthConfig() {
    this.logger.info('== Start to deleting auth config...');
    const files = [
      'instance/ZLUX/pluginStorage/com.rs.bzadm/configurations/dataSourceSetting.json',
      //not insert to bzdb, keep it
      //'instance/ZLUX/pluginStorage/com.rs.bzw/configurations/dataSourceSetting.json', // used by 'user-privilege-controller.js'
      'instance/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin/ldapServerConfig.json',
      'instance/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin/msSQLServerConfig.json',
      'instance/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin/ssoServerConfig.json'
    ];
    for (const file of files) {
      this.logger.info(`== deleting file '${file}'...`);
      if(fs.existsSync(path.join(this.deployDir, file))) {
        fs.unlinkSync(path.join(this.deployDir, file));
      }
    }
    this.logger.info('== Finished deleting auth config.');
  }

  /**
   * Name:  copyZluxServerConfig
   * Desc:  copy zlux server config files and certificate related files.
   */
  async copyZluxServerConfig() {
    this.logger.info('== Start to copy zlux server config...');
    // 10.2.1, logging.json
    this.logger.info(`upgrade logging.json...`);
    await this.upgradeService.upgradeServerLogging();
    // 10.2.1, securityHeader.json
    this.logger.info(`upgrade securityHeader.json...`);
    await this.upgradeService.upgradeSecurityHeader();
    // 10.2.1, nodejsConfig.json
    this.logger.info(`upgrade nodejsConfig.json...`);
    await this.upgradeService.upgradeNodeConfigPath();
    // zluxserver.json
    const updatedUrl = this.upgradeService.updateZluxServerConfig();
    // copy .key, .cert, .pfx and etc.
    const dirs = [
      'instance/ZLUX/serverConfig',
      'product/ZLUX/serverConfig'
    ];
    const excludes = [ // 10.2.1
      'zluxserver.json',
      'logging.json',
      'securityHeader.json',
      'nodejsConfig.json',
    ]
    function filter(name) {
      return !excludes.includes(name); // 'zluxserver.json' !== name;
    }
    for (const dir of dirs) {
      const src = path.join(this.migrateDir, dir);
      const dst = path.join(this.deployDir, dir);
      this.logger.info(`== copying folder '${src}'...`);
      this.utiles.copyDirectory(src, dst, filter);
    }
    this.logger.info('== Finished copying zlux server config.');
    return updatedUrl;
  }

  /**
   * Name:  copyW2HServerSetting
   * Desc:  copy W2H sever settings.
   */
  copyW2HServerSetting() {
    this.logger.info('== Start to copy W2H server setting...');
    const file = BZW2H_GLOBAL_SETTING_FILE;
    this.logger.info(`== copying file '${file}'...`);
    this.utiles.copyFile(path.join(this.migrateDir, file), path.join(this.deployDir, file));
    this.logger.info('== Finished copying W2H server setting.');
  }

  /**
   * Name:  migrateProductW2H
   * Desc:  migrate deploy/product W2H settings.
   */
  migrateProductW2H() {
    this.logger.info('== Start to migrate product W2H setting...');
    const w2hDir = BZW2H_PRODUCT_DIR;
    
    // copy license file
    function licFilter(name) {
      return name.match(/.*\.lic$/);
    }
    this.logger.info(`== copying license files...`);
    this.utiles.copyDirectory(path.join(this.migrateDir, w2hDir), path.join(this.deployDir, w2hDir), licFilter);

    // copy custom folder, start from 10.1.0
    {
      this.logger.info(`== copying custom folders...`);
      const srcDir = path.join(this.migrateDir, BZW2H_PRODUCT_DIR, 'custom');
      const dstDir = path.join(this.deployDir, BZW2H_PRODUCT_DIR, 'custom');
      if (fs.existsSync(srcDir)) {
        fse.copySync(srcDir, dstDir);
      }
    }

    // copy files
    /* const files = [
      // path.join(w2hDir, 'bluezone.lic'),
      path.join(w2hDir, 'template/default.ini'),
      path.join(w2hDir, 'template/global.ini')
    ];
    for (const file of files) {
      this.logger.info(`== copying file '${file}'...`);
      this.utiles.copyFile(path.join(this.migrateDir, file), path.join(this.deployDir, file));
    }

    // update major version in default.ini
    this.updateBzIniFiles(path.join(this.deployDir, w2hDir, 'template'));
    */

    // merge template/default.dst
    this.logger.info('== merging file template/default.dst...');
    const file = path.join(w2hDir, 'template/default.dst');
    try {
      const srcData = fs.readFileSync(path.join(this.migrateDir, file), 'utf8');
      let   dstData = fs.readFileSync(path.join(this.deployDir, file), 'utf8');
      const srcLines = srcData.replace(/[\r\n]/g, '\r').replace(/\r+/g, '\r').split('\r');
      const dstLines = dstData.replace(/[\r\n]/g, '\r').replace(/\r+/g, '\r').split('\r');
      const srcFiles = srcLines.map(e => e.trim().replace(/,\d+$/, '').trim());
      const dstFiles = dstLines.map(e => e.trim().replace(/,\d+$/, '').trim());
      for (const fn of srcFiles) {
        if ('' !== fn && '../global.ini' !== fn && !dstFiles.includes(fn)) {
          let filePath = path.join(this.deployDir, w2hDir, 'private', fn);
          if (fs.existsSync(filePath)) {
            this.logger.info(`== adding '${fn}' to default.dst...`);
            dstData += fn + ',1\r\n';
            dstFiles.push(fn);
          } else {
            // customer's own file
            const newfn = '../custom/' + fn.split('/').pop();
            if (!dstFiles.includes(newfn)) {
              this.logger.info(`== adding '${newfn}' to default.dst...`);
              dstData += newfn + ',1\r\n';
              dstFiles.push(newfn);
            }
            filePath = path.join(this.deployDir, w2hDir, 'private', newfn);
            if (!fs.existsSync(filePath)) {
              // need copy to 'custom' folder
              this.logger.info(`== copying file '${newfn}'...`);
              const srcFile = path.join(this.migrateDir, w2hDir, 'private', fn);
              this.utiles.copyFile(srcFile, filePath);
            }
          }
        }
      }
      this.logger.info('== writing file template/default.dst...');
      fs.writeFileSync(path.join(this.deployDir, file), dstData, { mode: 0o770 });
    } catch (e) {
      this.logger.severe(`Failed to merge file 'template/default.dst' with error '${e}'`);
    }
    this.logger.info('== Finished migrating product W2H setting.');
  }

  /**
   * Name:  migrateInstanceW2H
   * Desc:  migrate deploy/instance W2H settings. (start from v10.1.0)
   */
  migrateInstanceW2H() {
    this.logger.info('== migrateInstanceW2H start...');
    let srcDir = '';
    let dstDir = '';
    // copy groups dir, start from v10.1.0
    srcDir = path.join(this.migrateDir, BZW2H_INSTANCE_DIR);
    dstDir = path.join(this.deployDir, BZW2H_INSTANCE_DIR);
    if (fs.existsSync(srcDir)) {
      fse.copySync(srcDir, dstDir);
    }
    this.logger.info('== migrateInstanceW2H end');    
  }

  /**
   * Name:  updateBZDB
   * Desc:  backup BZDB dir and update BZDB. (start from v10.1.0)
   */
  updateBZDB() {
    this.logger.info('== Start to copy BZDB folder...');
    const srcDir = path.join(this.migrateDir, BZDB_DIR);
    const dstDir = path.join(this.deployDir, BZDB_DIR);
    const srcContents = fs.readdirSync(srcDir);
    const excludeDirs = ['_metadata'];
    for (const tPath of srcContents) {
      if (excludeDirs.includes(tPath)) continue;
      try {
        fse.copySync(path.join(srcDir, tPath), path.join(dstDir, tPath));
      } catch (e) {
        this.logger.severe(`[updateBZDB], failed to copy ${tPath}\n${e.stack}`);
        throw Error('Failed to copy BZDB')
      }
    }
    // BZ-15213, move this.upgradeService.cleanUpCurrentData() to doUpdate()
    /*try {
      const timestamp = Date.now();
      const backupDir = `${dstDir}_${timestamp}`;
      fs.renameSync(dstDir, backupDir);
    } catch (e) {
      this.logger.warn(`updateBZDB() fs.renameSync error: '${e}'`);      
      this.logger.info(`updateBZDB() try to clean bzdb folder`);
      this.upgradeService.cleanUpCurrentData();
    }*/ 

    // fse.copySync(srcDir, dstDir);
    this.logger.info('== Finished copying BZDB folder.');
  }

  /**
   * Name:  update811GroupSettings
   * Desc:  update group settings for version 8.1.1. (start from v10.1.0)
   */
  async update811GroupSettings() {
    this.logger.info('== Start to update 8.1.1 group setting...');
    // example of web2hServerSettings.json in 8.1.0
    // {
    //   "licenseName": "bluezone.lic",
    //   "LMServerName": "192.168.1.1",
    //   "LMServerPort": 8421,
    //   "serverURL": "",
    //   "method": "launchPad",
    //   "enableUsePersonal": true,
    //   "cacheFile": "application",
    //   "cacheBit": "windows",
    //   "createShortcut": true,
    //   "createMenu": true,
    //   "shortcutName": "BZW2H",
    //   "clearFile": true,
    //   "useLogEvents": true,
    //   "language": "English",
    //   "download": true
    // }  
    const data = this.readJsonFile(path.join(this.deployDir, BZW2H_GLOBAL_SETTING_FILE));
    // BZW2H 8.1.1 only supports W2H
    const w2hGlobal = {
      method: data.hasOwnProperty('method') ? data.method : 'launchPad', 
      LMGroup: '',
      usePersonal: data.hasOwnProperty('enableUsePersonal')? data.enableUsePersonal: true,
      cacheFile: data.hasOwnProperty('cacheFile') ? data.cacheFile : 'application',
      cacheBit: data.hasOwnProperty('cacheBit') ? data.cacheBit : '32',
      openWLConfig: {
        createDesktop: data.hasOwnProperty('createShortcut') ? data.createShortcut : true,
        shortcut: data.hasOwnProperty('shortcutName') ? data.shortcutName : 'BZW2H',
        createMenu: data.hasOwnProperty('createMenu') ? data.createMenu : true,
        clearFile: data.hasOwnProperty('clearFile') ? data.clearFile : true  // BZ-14402
      },
      language: data.hasOwnProperty('language') ? data.language : 'English',
      useGlobalSetting: true,
      globalIni: '',
      defaultIni: ''
    };

    await bzdb.refreshDataEntity('groupSetting');
    const gsData = (await bzdb.select('groupSetting')).data;
    const gids4Settings = [];
    for (const gs of gsData) {
      // {
      //   "0000002": {
      //     "gid": "0000002",
      //     "w2h": {
      //       "method": "launchPad",
      //       "LMGroup": "Prod"
      //     }
      //   }
      // }
      gids4Settings.push(gs.gid);
      const w2h = JSON.parse(JSON.stringify(w2hGlobal));
      Object.assign(w2h, gs.w2h);
      w2h.useGlobalSetting = (w2h.method === w2hGlobal.method);
      gs.w2h = w2h;
    }
    if ('launchPad' !== data.method) {
      // BZ-15223, for the case that global launch method was not set to 'launchPad'
      await bzdb.refreshDataEntity('group');
      const grps = (await bzdb.select('group')).data;
      for (const g of grps) {
        if (gids4Settings.includes(g.id)) {
          continue;
        } else {
          // create group settings
          const w2h = JSON.parse(JSON.stringify(w2hGlobal));
          w2h.method = 'launchPad';
          w2h.useGlobalSetting = false;
          gsData.push({gid: g.id, w2h: w2h});
        }
      }
    }
    await bzdb.bulkLoad('groupSetting', gsData);
    this.logger.info('== Finished updating 8.1.1 group setting.');
  }
  
  /**
   * Name:  clearExistingData
   * Desc:  clear exising data..(start from v10.1.0)
   */
  clearExistingData() {
    this.logger.info('== clearExistingData start...');
    const groupDir = path.join(this.deployDir, BZW2H_INSTANCE_DIR, 'groups');
    this.utiles.rmdirSync(groupDir);
    if (!fs.existsSync(groupDir)) {
         fs.mkdirSync(groupDir);
    }
    this.logger.info('== clearExistingData end.');
  }

  /*
  ver1 >= ver2: true
  ver1 < ver2: false
  ver1 or ver2 is NULL: false
  */
  compareVer(ver1, ver2)
  {
    if(ver1 && ver2) {
      let arr1 = ver1.split('.');
      let arr2 = ver2.split('.');
      let minLen = Math.min(arr1.length, arr2.length);
      let index = 0;
      while( index < minLen ) {
        if(parseInt(arr1[index]) > parseInt(arr2[index])){
          return true;
        }else if(parseInt(arr1[index]) == parseInt(arr2[index])){
          index++;
        }else{
          return false;
        } 
      }
      if(index >= minLen) return true;//same version
    }
    return false;
  }
  
  AddID4SessionSettings()
  {
    const rootDir = SESSION_SETTINGS_DIR;
    const dirs = [
      path.join(rootDir, 'hotspots'),
      path.join(rootDir, 'keyboardmapping'), // BZ-15419
      path.join(rootDir, 'launchpad'),
      path.join(rootDir, 'preference')
    ];
    for (const dir of dirs) {
      const dst = path.join(this.deployDir, dir);
      this.logger.info(`== Add ID to sessionsettings files`);
      if (!fs.existsSync(dst)) {
        this.logger.info(`[AddID4SessionSettings], '${dst}' does not exist`);
        continue;
      }
      let files = fs.readdirSync(dst);
            for (const file of files) {
                try {
                    let data = this.readJsonFile(path.join(dst, file));//fse.readJSONSync(path.join(dst, file), 'utf-8');
                    let isUpdate = false;
                    if ( !data.id ) {
                      isUpdate = true;
                      data.id = file.substr( 2, file.indexOf(".") - 2 );
                    }
                    if (!data.timestamp) { // BZ-15419
                      isUpdate = true;
                      data.timestamp = Date.now();
                    }
                    if (isUpdate) {                      
                      fs.writeFileSync(path.join(dst, file), JSON.stringify(data) );
                    }
                } catch (e) {
                  this.logger.severe(`[AddID4SessionSettings] Failed to add ID to file '${file}' with error '${e}'`);
                }
            } // end for
    }
    this.logger.info('== Finished adding ID.');

  }

  /**
   * Name:  doUpdate
   * Desc:  upgrade BZW2H data
   */
  async doUpdate() {
    this.logger.info('== Start to upgrade...');

    let rtnObj =  {
      status: true, 
      message: 'Upgrade successfully',
      needRestart: true,
      updatedUrl: ''
    };

    try {
      this.migrateDir = this.upgradeService.upgradePath; // BZ-21512
      this.upgradeService.backFile(); //backup need files (from 10.1.4)

      const oldVersion = this.getVersion(this.migrateDir);
      const curVersion = this.getVersion(this.deployDir);
      if(!this.compareVer(curVersion, oldVersion)) {//If version of deploy is less than migrate
        return {
          status: false,
          degraded: true,
          message: 'No need to upgrade since the migrate version is newer than current version.'
        }
      }
      await this.upgradeService.cleanUpCurrentData(); // BZ-15213, clear bzdb first
      this.clearExistingData();  // clear instance/ZLUX/pluginStorage/com.rs.bzw2h/groups
      if (oldVersion.startsWith('8.1.0')) {
        await this.migrate810Sessions();
        await this.migrate810Users();
        await this.migrate810Groups();
      } else {
        this.copySessionProfiles();
        this.copyGroupIdFile();
        this.updateBZDB();
      }
      this.migrateProductW2H();
      this.migrateInstanceW2H();
      rtnObj.updatedUrl = await this.copyZluxServerConfig(); // update in 10.2.1
      this.copyAuthConfig();
      this.copyW2HServerSetting();
      await this.copyBzaConfig();  // added in 10.1.2, update in 10.2.1
      // update group setting for 8.1.1
      if (oldVersion.startsWith('8.1.1')) {
        await this.update811GroupSettings();
      }
      {
        // BZA session setting and keyboard mapping
        if (!this.compareVer(oldVersion, '10.1.2')) { // 8.1.0, 8.1.1, 8.1.2, 10.1.0, 10.1.1
          // copy session setting and keyboard mapping to deploy folder
          this.copySessionSettings();
          this.AddID4SessionSettings();  //8.1.0 has no ID
        }
        if (!this.compareVer(oldVersion, '10.1.1')) { // 8.1.0, 8.1.1, 8.1.2, 10.1.0
          // BZA: keyboard mapping refactor (use key code), update keyboard mapping in deploy folder
          const result = this.upgradeKeyboardMapping();
          if (!result) {
            return this.logUpdateFailure('Failed to upgrade keyboard mappings');
          }
        }
        if (!this.compareVer(oldVersion, '10.1.2')) { // 8.1.0, 8.1.1, 8.1.2, 10.1.0, 10.1.1
          const msg = 'upgrade session settings and keyboard mapping to BZDB'
          this.logger.info(`== Start to ${msg}...`);
          const result = await this.upgradeTo10_1_2.moveShareSettingToBZDB();
          if (!result.status) {
            return this.logUpdateFailure(`Failed to ${msg}`);
          }
          this.deleteSessionSettings();
          this.logger.info(`== Finished to ${msg}`);
        }
      }
      if (!this.compareVer(oldVersion, '10.1.1')) { // 8.1.0, 8.1.1, 8.1.2, 10.1.0
        const msg = 'upgrade auth configurations to BZDB'
        this.logger.info(`== Start to ${msg}...`);
        const result = await this.upgradeTo10_1_1.configurationUpgrade();
        if (!result.status) {
          return this.logUpdateFailure(`Failed to ${msg}`);
        }
        this.deleteAuthConfig();  //remove the files which are inserted to bzdb
        this.logger.info(`== Finished to ${msg}`);
      }
      if (!this.compareVer(oldVersion, '10.1.2')) { // 8.1.0, 8.1.1, 8.1.2, 10.1.0, 10.1.1
        // w2h: configuration, profile, group files, license, group file dist
        const result = await this.update1012BZDB();
        if (!result) {
          return this.logUpdateFailure('Failed to upgrade WDM configurations to BZDB');
        }
      }
      if (!this.compareVer(oldVersion, '10.1.4')) { // before 10.1.4
        const msg = 'upgrade for 10.1.4 features';
        this.logger.info(`== Start to ${msg}...`);
        await this.upgradeService.refreshBzdb(); // Refresh bzdb data entities
        const result = await this.upgradeTo10_1_4.doUpgrade(this.upgradeService.upgradePath);
        if (!result.status) {
          return this.logUpdateFailure(`Failed to ${msg}`);
        }
      }
      if (!this.compareVer(oldVersion, '10.2.0')) { // before 10.2.0
        const msg = 'upgrade for 10.2.0 features';
        this.logger.info(`== Start to ${msg}...`);
        await this.upgradeService.refreshBzdb();
        const result = await this.upgradeTo10_2_0.convertDatasource(); // TOTP
        if (!result.status) {
          return this.logUpdateFailure(`Failed to ${msg}`);
        }
      }
      if (!this.compareVer(oldVersion, '10.2.1')) { // before 10.2.1
        const msg = 'upgrade for 10.2.1 features';
        this.logger.info(`== Start to ${msg}...`);
        await this.upgradeService.refreshBzdb();
        const result = await this.upgradeTo10_2_1.decoupleCAwithHTTPS();
        if (!result.status) {
          return this.logUpdateFailure(`Failed to ${msg}`);
        }
      }
      // check whether need to recreate service(pm2 or windows service)
      const nodeCheckResult = await this.upgradeService.checkNodeJsConfig(); 
      rtnObj = Object.assign(rtnObj, nodeCheckResult);
      this.upgradeService.removeBack(); // remove the backup (from 10.1.4)
      this.logger.info('== Finished upgrading');
      return rtnObj;
    } catch (e) {
      this.logger.severe(e.stack);
      return this.logUpdateFailure(`Failed to upgrade with error '${e.message}'`);
    }
  }

  logUpdateFailure(msg) {
    this.logger.severe(msg);
    return { status: false, message: msg };
  }

  updateBzIniFiles(dir) {
    try {
      let file = '';
      // update default.ini file
      file = path.join(dir, 'default.ini');
      if (fs.existsSync(file)) {
        let data = fs.readFileSync(file, 'utf-8');      
        data = data.replace(/(MajorVersion\s*=\s*)[^\r\n]+/g, `$1${w2h_const.MAJOR_VERSION}`);
        fs.writeFileSync(file, data);
      } else {        
        this.logger.warn(`== updateBzIniFiles, '${file} does not exist', ${e}.`);
      }
      // update global.ini file
      file = path.join(dir, 'global.ini');
      if (fs.existsSync(file)) {
        let data = fs.readFileSync(file, 'utf-8');      
        data = data.replace(/(WebHelpUrl\s*=\s*)[^\r\n]+/g, `$1${w2h_const.helpUrl}`);
        fs.writeFileSync(file, data);
      } else {        
        this.logger.warn(`== updateBzIniFiles, '${file} does not exist', ${e}.`);
      }
    } catch (e) {
      this.logger.warn(`== updateBzIniFiles, failed to MajorVersion in '${file}', ${e}.`);
    }
  }

  readJsonFile(file) {
    if (!fs.existsSync(file)) {
      return {};
    }

    let rawData = '';
    let data = {};
    try {
      //const data = fse.readJsonSync(entityFile, 'utf8');
      rawData = fs.readFileSync(file, 'utf8');
      try {
        data = JSON.parse(rawData);
      } catch (e) {
        // BZ-13634, sometimes nodejs reads file using EBCDIC encoding, which caused JSON.parse() failed.
        // Error msg: 'SyntaxError: Unexpected token # in JSON at position 0'
        // We found this parse issue always occurs in the first json file, so we will try to read the same file again to avoid this issue.
        this.logger.severe(`[readJsonFile] Failed to parse file '${file}' with error '${e}', try again...`);
        rawData = fs.readFileSync(file, 'utf8');
        data = JSON.parse(rawData);
      }
    } catch (e) {
      this.logger.severe(`[readJsonFile][2] Failed to parse file '${file}' with error '${e}'`);
      return {};
    }
    return data;
  }

  updateKeyboardMapping(file, type) {
    const data = this.readJsonFile(file);
    if(JSON.stringify(data) === '{}') throw `failed to read file ${file}`;
    const defaultFile = path.join(this.migrateDir, BZ_DEFAULT_DIR, `default${type}KeyboardMapping.json`);
    const defaultData = this.readJsonFile(defaultFile);
    if(JSON.stringify(defaultData) === '{}') throw `failed to read file ${defaultFile}`;
    data.keyboardMapping.forEach((d, i) => {
      if(d.key.length !== 1 && d.key.indexOf('Numpad') === -1) return;
      d.mapping.forEach((m, j) => {
          if(m.type !== 'KEYMAP_TYPE_KEY') return;
          const dm = defaultData.keyboardMapping[i].mapping[j];
          if(m.value !== 'null' && m.value === dm.value) {
            m.value = 'null';
            m.type = 'null';
          }
      });
    });

    this.upgrade1010KeyboardMapping(data, type);

    const json = JSON.stringify(data);
    fs.writeFileSync(file, json);
  }

  upgradeKeyboardMapping() {
    this.logger.info('== Start to update keyboard mappings...');
    const dir = path.join(this.deployDir, SESSION_SETTINGS_DIR, 'keyboardmapping');
    if (!fs.existsSync(dir)) {
      this.logger.info(`[upgradeKeyboardMapping] '${dir}' does not exist`);
      return true;
    }
    try {
      const files = fs.readdirSync(dir);
      for(const item of files) {
        const file = path.join(dir, item);
        if(fs.statSync(file).isDirectory()) continue;
        this.logger.info(`== ${item}`);        
        if(item.indexOf('K_BZAM') != -1) {  //3270
          this.updateKeyboardMapping(file, '3270');
        } else if(item.indexOf('K_BZAI') != -1) {
          this.updateKeyboardMapping(file, '5250');
        } else if(item.indexOf('K_BZAV') != -1) {
          this.updateKeyboardMapping(file, 'VT');
        }
      }
    } catch(e) {
      this.logger.severe(`[upgradeKeyboardMapping] Failed to update keyboard mapping with error '${e}'`);
      return false;        
    }
    this.logger.info('== Finish to update keyboard mappings...');
    return true;
  }

  upgrade1010KeyboardMapping(data, type) {
    const changed = {
      "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4", "5": "Digit5", "6": "Digit6", "7": "Digit7", "8": "Digit8", "9": "Digit9", "0": "Digit0",
      "!": "1Digit1", "@": "2Digit2", "#": "3Digit3", "$": "4Digit4", "%": "5Digit5", "^": "6Digit6", "&": "7Digit7", "*": "8Digit8", "(": "9Digit9", ")": "0Digit0",
      "a": "KeyA", "b": "KeyB", "c": "KeyC", "d": "KeyD", "e": "KeyE", "f": "KeyF", "g": "KeyG", "h": "KeyH",
      "i": "KeyI", "j": "KeyJ", "k": "KeyK", "l": "KeyL", "m": "KeyM", "n": "KeyN", "o": "KeyO", "p": "KeyP",
      "q": "KeyQ", "r": "KeyR", "s": "KeyS", "t": "KeyT", "u": "KeyU", "v": "KeyV", "w": "KeyW", "x": "KeyX", "y": "KeyY", "z": "KeyZ",

      "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash",
      "_": "-Minus", "+": "=Equal", "{": "[BracketLeft", "}": "]BracketRight", "~": "`Backquote",
      ";": "Semicolon", "'": "Quote", ",": "Comma", ".": "Period", "/": "Slash",
      ":": ";Semicolon", "\"": "'Quote", "<": ",Comma", ">": ".Period", "?": "/Slash",
      " ": "Space", "`": "Backquote"
    }

    const unchanged = [
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", 
      "PrintScreen", "ScrollLock", "Pause", "Backspace", "Insert", "Home", "Tab", "Delete", "End", "PageDown", "PageUp", "CapsLock", 
      "Enter", "ShiftLeft", "ShiftRight", "Up", "Down", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
      "Numpad*", "Numpad-", "Numpad+", "NumpadInsert", "NumpadDelete", "NumpadEnter", "NumpadPageUp", "NumpadPageDown", 
      "NumpadLeft", "NumpadRight", "NumpadEnd", "Numpad.", "Numpad/", "NumpadHome", "NumpadUp", "NumpadDown",
      "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4","Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9",
      "Left", "Right", "Down", "Up", "Escape"
    ];

    this.logger.info('== Start to convert old ascii keys to keycode in keyboard mappings...');

    let keyboardMapping = [];
    let ii = 0;
    data.keyboardMapping.forEach((d, i) => {
      const key = changed[d.key];
      if(!key) {
        const item = unchanged.filter(e => e === d.key);
        if(item.length) {
          keyboardMapping[ii] = d;
          ii++;
        }
        return;
      }
      let item = {};
      Object.assign(item, d);
      const pairKey = changed[key[0]];
      if(key.substring(1) === pairKey) { //shift case
        item.key = pairKey;
        let pairItem;
        pairItem = keyboardMapping.filter(d => d.key === pairKey);
        if(!pairItem.length) {
          pairItem = data.keyboardMapping.filter(d => d.key === key[0]);
          item.mapping = pairItem[0].mapping;
          keyboardMapping[ii] = item;
          ii++;
        } else {
          item.mapping = pairItem[0].mapping;
        }

        d.mapping.forEach((m, j) => {
          if(m.value !== "null" && (j === 1 || j === 5 || j === 6 || j === 7)) {
            item.mapping[j] = m;
          }
        });        
      } else {
        const found = keyboardMapping.filter(d => d.key === key);
        if(!found.length) {
          item.key = key;
          keyboardMapping[ii] = item;
          ii++;
        }
      }
    });
    this.logger.info('== Finish to convert old ascii keys to keycode in keyboard mappings...');

    data.keyboardMapping = keyboardMapping;
    const defaultFile = path.join(this.deployDir, BZ_DEFAULT_DIR, `default${type}KeyboardMapping.json`);
    const defaultData = this.readJsonFile(defaultFile);
    data.defaultKeyboardMapping = defaultData.keyboardMapping;  
    if(data.keyboardLanguage && data.keyboardLanguage.length > 0) {
      data.keyboardLanguage = data.keyboardLanguage[0];
    } else {
      data.keyboardLanguage = {
        "name": "US Standard",
        "value": "English (United States)",
        "altGrOn": false,
        "lang": "en-us"
      };
    }
    
    this.logger.info('== Use new default keyboard mappings');    
    return data;
  }
  async loadFile2DB(dataEntity,folder, filter = function(){return true;}, prefix = ''){
    try{
      if (!fs.existsSync(folder)) return;
      let files = fs.readdirSync(folder).filter(fn => filter(fn));
      const batchTxnData = []
      for (const file in files) {
        let value = {
          fileName: prefix?`${prefix}/${files[file]}`: files[file],
          data: JSON.stringify(fs.readFileSync(path.join(folder, files[file])))
        }
        batchTxnData.push({ dataEntityName: dataEntity, action: 'UPDATEORINSERT', value: value });
      }
      if (batchTxnData.length) {
        await bzdb.batchTxn(batchTxnData);
      }
    }catch(err){
      throw err;
    }
  }
  async update1012BZDB(){
    this.logger.info('== Process configuration file for BZDB ==');
    try{
      if(fs.existsSync(path.join(this.deployDir,BZW2H_GLOBAL_SETTING_FILE)))
      {
        const fileData = JSON.parse(fs.readFileSync(path.join(this.deployDir, BZW2H_GLOBAL_SETTING_FILE),'utf8'));
        const res = await bzdb.updateOrInsert('configurations',{
          fileName:'web2hServerSettings.json',
          data: fileData});
        if(!res.status){
          throw new Error(res.message);
        }else{
          fs.unlinkSync(path.join(this.deployDir,BZW2H_GLOBAL_SETTING_FILE));
        }
      }
    }catch(err){
     this.logger.warn(`Error occur when processing configuration file: ${err.message}`)
     return false; 
    }
    this.logger.info('== Finished processing configuration file == ');

    this.logger.info(' == Process sessions file for BZDB == ');
    try{
      await this.loadFile2DB('w2hProfiles', path.join(this.deployDir,BZW2H_SESSION_FOLDER))
      
    }catch(err){
      this.logger.warn(`Error occur when processing session profiles: ${err.message}`);
      return false; 
    }
    this.logger.info('== Finished processing session files');

    this.logger.info('== Process group files for BZDB ==');
    try{
      const folders = fs.readdirSync(path.join(this.deployDir,BZW2H_GROUP_FOLDER));
      
      const fileFilter = function(s){
        return ['default.ini','global.ini','desktop.ini','default.dst'].indexOf(s) > -1;
      }
      for(const folder in folders){
        await this.loadFile2DB('w2hGroups', path.join(this.deployDir, BZW2H_GROUP_FOLDER,folders[folder]), fileFilter, folders[folder]);
      }
    }catch(err){
      this.logger.warn(`Error occur when processing group files: ${err.message}`) 
      return false; 
    }
    this.logger.info('== Finished processing group files ==');

    this.logger.info('== Process license file for BZDB == ');
    try{
      const licenseFolder = path.join(this.deployDir,BZW2H_PRODUCT_DIR);
      const licFilter = function(s){
        return s === 'bluezone.lic';
      }
      this.loadFile2DB('w2hLicense', licenseFolder, licFilter);
    }catch(err){
      this.logger.warn(`Error occur when processing license profiles: ${err.message}`);
      return false; 
    }
    this.logger.info('== Finished processing license file ==');
      
    this.logger.info('== Process distribution files for BZDB ===');
    try{

      const distFiles = fs.readdirSync(path.join(this.deployDir,BZW2H_DIST_FOLDER));
      const batchTxnDataDist = [];
      for(const file in distFiles){
        if(!fs.statSync(path.join(this.deployDir, BZW2H_DIST_FOLDER, distFiles[file])).isFile()) continue;
        const fsi = await bzdb.getFileSyncInfo(path.join(this.deployDir,BZW2H_DIST_FOLDER,distFiles[file]), true);
        batchTxnDataDist.push({dataEntityName: 'w2hFileDists', action:'UPDATEORINSERT', value: fsi})
      }
      if(batchTxnDataDist.length){
        const res = await bzdb.batchTxn(batchTxnDataDist);
        if(!res.status){
          throw new Error(res.message)
        }
      }
    }catch(err){
      this.logger.warn(`Error occur when processing distribution profiles: ${err.message}`);
      return false; 
    }
    this.logger.info('=== Finished processing dist files ===');
    return true; 
  }
  
}

module.exports = UpgradeDataW2hService;
