'use strict';

const fs = require('fs-extra');
const path = require('path');
const ini = require('ini');
const bzdb = require('../../../bzshared/lib/services/bzdb.service');
const importsite = require('./bzw2hImportSite/import-site.service');
const Utils = require('./utils.service');
const Bzw2hUtils = require('./bzw2h-utils');
const w2hPriv = require("../model/w2h-privilege.model");
const w2h_const = require('../../../bzshared/lib/model/w2h-const');
const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');

const BZW2H_PATH = '/ZLUX/pluginStorage/com.rs.bzw2h';
const BZW2H_DIST_DIR_CUSTOM = 'custom';
const BZW2H_PRODUCT_TMP_DIR = 'tmp';
const BZDB_W2H_SETTING = 'groupSetting';
const BZDB_W2H_DIST = 'groupDist';
const BZDB_W2H_DIST_FILES = 'w2hFileDists';
const TEMP_PRE = 'temp_';
const GLOBALINI = 'global.ini';
const DEFAULTINI = 'default.ini';

class Bzw2hConfigService {
  constructor(context) {
    this.context = context;
    this.logger = context.logger;
    this.isEnabled = context.plugin.server.config.user.bzw2hMode ? true : false;
    this.bzw2hDir = path.join(context.plugin.server.config.user.productDir, BZW2H_PATH);
    this.instanceDir = context.plugin.server.config.user.instanceDir;
    this.GroupRootDir = path.join(this.instanceDir, 'ZLUX/pluginStorage/com.rs.bzw2h/groups');
    this.distDirs = ['shared', 'configs', BZW2H_DIST_DIR_CUSTOM];
    this.bzw2hTmpDir = path.join(this.bzw2hDir, BZW2H_PRODUCT_TMP_DIR);
    this.importSite = importsite.init(context, this);
    this.utils = new Utils();
    this.dataSteward = InternalDataSteward.initWithContext(context);    
    
    this.customDir = path.join(this.bzw2hDir, BZW2H_DIST_DIR_CUSTOM);
    if (this.isEnabled && !fs.existsSync(this.customDir)) {
      try {
        fs.mkdirSync(this.customDir, {recursive: true});
      } catch (e) {
        this.logger.severe(`Failed to create directory '${this.customDir}', ${e}`);
      }
    } 
  }

  setSetting4GroupDB(data) {
    const batchTxnData = [];
    const grpData = {
      gid: data.gid,
      sd: data.sd,
      deployMode: data.deployMode,
      w2h: data.w2h
    };
    batchTxnData.push({ dataEntityName: BZDB_W2H_SETTING, action: 'UPDATEORINSERT', value: grpData, options: {} });
    if (data.defaultIniData) {
      let tempDefaultData = this.processIniFile(data.defaultIniData, 'default.ini');
      if (!tempDefaultData) {
        throw new Error('Failed to parse default.ini');
      }
      const defaultFile = { fileName: `${data.gid}/default.ini`, data: JSON.stringify(tempDefaultData) };
      batchTxnData.push({ dataEntityName: 'w2hGroups', action: 'UPDATEORINSERT', value: defaultFile, options: {} });
    }
    if (data.globalIniData) {
      let tempGlobalData = this.processIniFile(data.globalIniData, 'global.ini');
      if (!tempGlobalData) {
        throw new Error('Failed to parse global.ini');
      }
      const globalFile = { fileName: `${data.gid}/global.ini`, data: JSON.stringify(tempGlobalData) };
      batchTxnData.push({ dataEntityName: 'w2hGroups', action: 'UPDATEORINSERT', value: globalFile, options: {} });

    }
    return batchTxnData;

  }

  checkFileExist( grpPath, retData ){
    let filePath = path.join( grpPath, GLOBALINI );
    //global.ini
    if(fs.existsSync(filePath)){
      if(retData.w2h.globalIni===undefined || retData.w2h.globalIni === '')
       retData.w2h.globalIni = GLOBALINI;
    }else{
       retData.w2h.globalIni = '';
    }
    //default.ini
    filePath = path.join( grpPath, DEFAULTINI );
    if(fs.existsSync(filePath)){
      if(retData.w2h.defaultIni===undefined || retData.w2h.defaultIni === '')
       retData.w2h.defaultIni = DEFAULTINI;
    }else{
       retData.w2h.defaultIni = '';
    }
  }
  async getSettingByGid(gid) {
    const gsData = {
      gid: gid,
      w2h: {
        method: 'launchPad', 
        LMGroup: '',
        usePersonal: true,
        cacheFile: "application",
        cacheBit: "32",
        openWLConfig:{
          createDesktop: true,
          shortcut: 'BZW2H',
          createMenu: true,
          clearFile: true
        },
        language: 'English',
        useGlobalSetting: true,  // BZ-14305
        globalIni: ''
      },
      dataSecurity: {
        overWriteServerDS: false,
        content:{}
      }
    };
    try {
       const data = (await bzdb.select(BZDB_W2H_SETTING, {gid: gid})).data;
       let retData = (data && data.length > 0) ? Object.assign(gsData,data[0]) : gsData;
       const grpData = (await bzdb.select('group', {id: gid})).data;
       if(grpData && grpData.length > 0)//BZ-14264 deploy mode
       {
        retData.deployMode = grpData[0].deployMode;
        retData.dataSecurity = grpData[0].dataSecurity;
       }
      
       const groupRootFolder = path.join(this.instanceDir, 'ZLUX/pluginStorage/com.rs.bzw2h/groups', gid)
       this.checkFileExist( groupRootFolder, retData)
       
       return {data:retData};   
    } catch (e) {
      this.logger.severe(`Failed to get settings for group '${gid}': ${e}`);
      return {data: gsData};
    }
  }

  async getSettings4W2HCM(gids) {
    if (!gids.trim()) {
      return {data: null};
    }
    const gidArray = gids.trim().split(',');
    try {
      const settings = {};
      for (let gid of gidArray) {
        gid = gid.trim();
        const gs = await this.getSettingByGid(gid);
        settings[gid] = gs.data;
        // console.log();
      }
      return {data: settings};
    } catch (e) {
      return {data: null};
    }
  }

  async getDownloadFileByGid( srcFileName, gid ){

    const filePath = path.join(this.GroupRootDir, encodeURIComponent(gid), srcFileName );

    try {
      if (!fs.existsSync(filePath)) {
          return null;
      } else {
          //BZ-14440
          if(srcFileName === 'default.ini') {
            let rs = await bzdb.select(BZDB_W2H_SETTING, {gid: gid});
            if (rs.rowCount > 0) {
              //Use personal folder as working directory              
              const data = fs.readFileSync(filePath, 'utf8');
              if(data) {
                let defaultIni = ini.parse(data);
                if(defaultIni) {
                  defaultIni['BlueZone']['UsePersonalFolderAsWorkingDir'] = rs.data[0].w2h.usePersonal ? 'Yes' : 'No'; 
                  fs.writeFileSync(filePath, ini.stringify(defaultIni));
                }
              }
            }
          }
          return filePath;
      }
    } catch (e) {
      this.logger.warn(`failed to get download file '${filePath}' due to ${e}.`);
      return null;
    }
  }

  /*saveFileByGid( srcFile, gId) {
    const file = {tempName: TEMP_PRE + srcFile, realName: srcFile};
    const groupRootFolder = this.GroupRootDir;
    const groupFolder = path.join(groupRootFolder,  gId);
    const tempPath = path.join(groupFolder, file.tempName);
    const realPath = path.join(groupFolder, file.realName);
    if(!fs.existsSync(tempPath)){
        let message = `Uploaded file is missing: ${tempPath}`;
        logger.severe(message);
        return false;
    }
    if(fs.existsSync(realPath))
        fs.unlinkSync(realPath);
    try {
      fs.copyFileSync( tempPath, realPath );
      fs.unlinkSync(tempPath);
      this.logger.info(`save ${realPath} file successfully.`);
      return true;
    } catch (e) {
      this.logger.severe(`Failed to copy ${realPath} from ${tempPath}: ${e}`);
      return false;
    }
    
  }*/

  processIniFile( fileStream, fileName ) {
    let tempStream = fileStream;
    try{
      tempStream = tempStream.replace(/(MajorVersion\s*=\s*)[^\r\n]+/g, `$1${w2h_const.MAJOR_VERSION}`);
      if(fileName ==='default.ini'){
        let rtn  = Bzw2hUtils.updatePrivFromDefaultIniStream(tempStream, w2hPriv.defaultPriv);
        if(rtn.err){
          this.looger.severe(`Failed to process default.ini : ${rtn.err}`);
        }
        tempStream = rtn.content;
      }else if(fileName === 'global.ini'){
        tempStream = tempStream.replace(/(WebHelpUrl\s*=\s*)[^\r\n]+/g, `$1${w2h_const.helpUrl}`);
        tempStream = this.removeDSData(tempStream);

      }
    }catch(e){
      this.logger.severe(`Failed to write ${fileName}: ${e}`);
      tempStream = '';
    }
    return tempStream;
    
  }
  removeDSData(fileStream){
    let iniContent = ini.parse(fileStream);
    if(iniContent['PCI-DSS']){
      iniContent['PCI-DSS'] = {};
    }
    return ini.stringify(iniContent);
  }

  getCustomDistDir() {
    return this.customDir;
  }
  
  getCustomDistTmpDir() {
    return path.join(this.customDir, 'tmp');
  }  

  /* // BZ-15263, move the logic to setDistFiles4Group
  async deleteCustomFile(filename) {
    const file = path.join(this.customDir, filename);
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        // remove the file from group dist
        const data = (await bzdb.select(BZDB_W2H_DIST)).data;
        for (const dist of data) {
          if (dist && dist.files) {
            const files = dist.files[BZW2H_DIST_DIR_CUSTOM];
            const index = files.indexOf(filename);
            if (index > -1) {
              files.splice(index, 1);
              await bzdb.updateOrInsert(BZDB_W2H_DIST, dist);
            }
          }
        }
        return true;
      } catch (e) {
        this.logger.severe(`Failed to delete custom dist file '${file}': ${e}`);
        return false;
      }
    }
  }*/

  printContext() {
    this.logger.info(JSON.stringify(this.context));
  }

  
  /**
     * Name:  setDistFiles4Group
     * Desc:  set file distribution and update uploaded files
     * Rtn:   object
     * Args:
     *        [payload] data object
     * payload = { dist: {gid: 'xx-xx', files: obj, features: ['bzmd']}, fc: { delFiles: ['foo.txt'], addFiles: [{name: bar.txt, tmpName: BGX_bar.txt}]} }
     * payload = { dist: {gid: 'xx-xx', files: obj, features: ['bzmd']} }
     */
  async setDistFiles4Group(payload) {    
    let batchTxnData = [];
    const data = payload.dist;
    const deleteFile4PostAction = (filename) => {
      const fp = path.join(this.customDir, filename);
      if (fs.existsSync(fp)) {
        try {
          fs.unlinkSync(fp);
        } catch (e) {
          this.logger.warn(`Bzw2hConfigService::setDistFiles4Group, 
            post action, failed to delete file '${file}': ${e.stack}`);
        }
      }
    }
    if (payload.fc) {
      const fc = payload.fc;
      for (const file of fc.delFiles) {
        const fp = path.join(this.customDir, file);
        const fsi = await bzdb.getFileSyncInfo(fp, false);
        batchTxnData.push({dataEntityName: BZDB_W2H_DIST_FILES, action:'UPDATEORINSERT', value: fsi});
        // remove the file from group dist
        const customfiles = data.files[BZW2H_DIST_DIR_CUSTOM];
        const index = customfiles.indexOf(file);
        if (index > -1) {
          customfiles.splice(index, 1);
        }
      }
      for (const file of fc.addFiles) {
        const src = path.join(this.getCustomDistTmpDir(), file.tmpName);
        const tgt = path.join(this.customDir, file.name);
        try {
          fs.renameSync(src, tgt);  // rename
          const fsi = await bzdb.getFileSyncInfo(tgt, true);
          batchTxnData.push({dataEntityName: BZDB_W2H_DIST_FILES, action:'UPDATEORINSERT', value: fsi});
        } catch (e) {
          this.logger.warn(`Bzw2hConfigService::setDistFiles4Group, 
            failed to rename file '${file.tmpName}' to '${file.name}': ${e}`);
        }
      }
    }
    try {
      batchTxnData.push({dataEntityName: BZDB_W2H_DIST, action:'UPDATEORINSERT', value: data});
      const result = await bzdb.batchTxn(batchTxnData);
      this.logger.info(`Bzw2hConfigService::setDistFiles4Group, [${result.status}]`);
      if (!result.status) {
        this.logger.warn(`Bzw2hConfigService::setDistFiles4Group, failed.\n ${JSON.stringify(result)}`);
      }
      if (payload.fc) {
        if (result.status) {
          // [success]: we need delete the files in fc.delFiles
          payload.fc.delFiles.forEach((file) => deleteFile4PostAction(file));
        } else {
          // [failure]: we need delete the new uploaded files in fc.addFiles
          payload.fc.addFiles.forEach((file) => deleteFile4PostAction(file.name));
        }
      }
      return result;
    } catch (e) {
      if (payload.fc) {
        // [failure]: we need delete the new uploaded files in fc.addFiles
        payload.fc.addFiles.forEach((file) => deleteFile4PostAction(file.name));
      }
      this.logger.severe(`Bzw2hConfigService::setDistFiles4Group,
        failed to set dist files for group : ${e.stack}`);
      return {status: false, message: 'Unknown error, please refer to server log for details'};
    }
  }

  async getDistFilesByGid(gid) {
    try {
       const data = (await bzdb.select(BZDB_W2H_DIST, {gid: gid})).data;
       return (data && data.length > 0) ? data[0] : null;
    } catch (e) {
      this.logger.severe(`Failed to get dist files for group '${gid}': ${e}`);
      return null;
    }
  }

  async deleteDistFilesByGid(gid) {
    try {
      await bzdb.delete(BZDB_W2H_DIST, { gid: gid });
      this.logger.info(`Delete dist files for group '${gid}' successfully`);
    } catch (e) {
      this.logger.severe(`Failed to delete dist files for group '${gid}': ${e}`);
    }
  }
  
  async getDistFiles4W2HCM(gids) {
    const distFiles = [];
    if (gids) {
      const gidArray = gids.split(',');
      try {
        for (const gid of gidArray) {
          const groupDist = await this.getDistFilesByGid(gid);
          if (groupDist && groupDist.files) {
            for (const dir in groupDist.files) {
              for (const file of groupDist.files[dir]) {
                const fp = dir + '/' + file;
                if (!distFiles.includes(fp)) {
                  distFiles.push(fp);
                }
              }
            }
          }
          if (groupDist && groupDist.features) {
            for (const ft of groupDist.features) {
              const fp = 'cabs/' + ft + '.cab';
              if (!distFiles.includes(fp)) {
                distFiles.push(fp);
              }
            }
          }
        }
        return {data: distFiles};
      } catch (e) {
        this.logger.severe(`Failed to get dist files for BZW2HCM '${gids}': ${e}`);
        return {data: []};
      }
    } else {
      return {data: []};
    }
  }

  /**
   * Name:  getClientDistInfoByGid
   * Desc:  send client distribution info to front end
   * Rtn:   object
   * Args:
   *        [gid] group ID
   */
  async getClientDistInfoByGid(gid) {
    const data = {
      dist: {},
      base: {},
      features: []
    };
    // const bzfs = {
    //   readdir: util.promisify(fs.readdir)
    // };
    
    // init
    const defaultDst = {}
    this.distDirs.forEach(dir => {
      defaultDst[dir] = [];
      data.dist[dir] = [];
      data.base[dir] = [];
    });

    // distribution files per group
    const groupDist = await this.getDistFilesByGid(gid);
    if (groupDist) {
      this.distDirs.forEach(dir => {
        if (groupDist.files[dir]) {
          data.dist[dir] = groupDist.files[dir];
        }
      });
      data.features = groupDist.features || [];
    }

    // default distribution files in default.dst
    let dstFile = path.join(this.bzw2hDir, 'template', 'default.dst');
    const groupDstFile = path.join(this.getGroupRootPath(), gid, 'default.dst');
    if (fs.existsSync(groupDstFile)) {
      dstFile = groupDstFile;
    }
    try {    
      let dst = fs.readFileSync(dstFile, 'utf8');  
      const newDstArr = [
        '../shared/rockette.ex_', // BZ-20285, 10.2.0
        '../shared/bzimg32.dl_',  // BZ-20285, 10.2.0
        '../shared/bzimg48.dl_',  // BZ-20285, 10.2.0
        '../shared/bzimg16new.dl_',  // BZ-21090, 10.2.0.1 and 10.2.1
        '../shared/bzimg24new.dl_',  // BZ-21090, 10.2.0.1 and 10.2.1
        '../shared/bzimg32new.dl_',  // BZ-21090, 10.2.0.1 and 10.2.1
        '../shared/bzimg48new.dl_',  // BZ-21090, 10.2.0.1 and 10.2.1
      ];
      for (const newDst of newDstArr) { // BZ-21130
        if (-1 === dst.indexOf(newDst)) {
          dst += newDst + ',1\r\n';
        }
      }
      const lines = dst.replace(/[\r\n]/g, '\r').replace(/\r+/g, '\r').split('\r');
      lines.forEach(line => {
        const file = line.trim().replace(/,\d+$/, '');
        const arr = file.split('/');
        if ((3 === arr.length) && (defaultDst[arr[1]])) {
          defaultDst[arr[1]].push(arr[2]);
        }
      });
    } catch (e) {
      this.logger.severe(`Failed to read default.dst: ${e}`);
    }

    // all available distribution files
    // this.distDirs.forEach( async (dir) => {
    //  data.base[dir] = [];   
    for (const dir in data.base) {
      const dirPath = path.join(this.bzw2hDir, dir);
      if (fs.existsSync(dirPath)) {
        try {
          //files[dir] = await bzfs.readdir(dirPath);
          const files = fs.readdirSync(dirPath);
          //files.forEach(file => {
          for (const file of files) {
            const stat = fs.statSync(path.join(dirPath, file));
            if (stat.isFile()) {
              const info = [ file, Date.parse(stat.mtime), stat.size, defaultDst[dir].includes(file) ];
              data.base[dir].push(info);
            }
          }
        } catch (e) {
          this.logger.severe(`Failed to get distribution files, error: ${e}`);
        }
      }
    }

    return {data: data};
  };

  getGroupRootPath() {
    return path.join(this.context.plugin.server.config.user.instanceDir, BZW2H_PATH, 'groups');
  }    

  deleteGroupRelatedDB(groupId) {
    //return [];
    let groupDir = '';
    let batchTxnData = [];
    try {
      groupDir = path.join(this.getGroupRootPath(), groupId);
      if(fs.existsSync(groupDir)) {
        const nFileList = ['default.dst','desktop.ini','global.ini', 'default.ini'];

        for(const file of nFileList){
          let fileName = `${groupId}/${file}`;
          if(fs.existsSync(`${groupDir}/${file}`)){
            batchTxnData.push({dataEntityName: 'w2hGroups', options:{filter: { fileName}}, action: 'DELETE', value: {}});
          }
        }
      }
      batchTxnData.push({dataEntityName: BZDB_W2H_DIST, options:{filter:{groupId}}, action: 'DELETE', value: {}});
      batchTxnData.push({dataEntityName: BZDB_W2H_SETTING, options:{filter:{groupId}}, action: 'DELETE', value: {}});

      return batchTxnData;
    } catch (err) {
        this.setLastError(`failed to delete group directory ${groupDir} due to ${err}`);
        this.logger.severe(this.error);
        return [];
    }
  }
  newGroupDirectoryDB(groupId, bIsW2hMode = true) {
    let groupDir = '';
    try {
      groupDir = path.join(this.getGroupRootPath(), groupId);
      if(fs.existsSync(groupDir)) return;
      this.utils.createDirs(groupDir);
      const templateDir = path.join(this.bzw2hDir, 'template');   
      const files = fs.readdirSync(templateDir);
      const nFileList = ['default.dst','desktop.ini','global.ini'];
      if(bIsW2hMode){
        nFileList.push('default.ini');
      }else{
        nFileList.push('default_sd.ini');
      }
      const neededFiles = files.filter(file => nFileList.indexOf(file) > -1);
      const batchTxnDataForFile = [];
      for(const file of neededFiles){
       
        //const dst = path.join(groupDir, file);
        const src = path.join(templateDir, file);
        const readResult = Bzw2hUtils.readData4BzdbRawFile(src);
        if(!readResult.status)
        {
          this.logger.severe(`[Bzw2hConfigService::newGroupFileCopy] Copy file to group folder failed. ${readResult.err}`)
          continue;
        }
        let tempFile = file;
        if(['default.ini','default_sd.ini'].indexOf(file) > -1){
          tempFile = 'default.ini';
        }
        const groupFile = {fileName: `${groupId}/${tempFile}`, data: readResult.data};
        batchTxnDataForFile.push({dataEntityName: 'w2hGroups', options:{}, action: 'UPDATEORINSERT', value: groupFile});

        //bzdb.insert('w2h-groups', groupFile);
      }
      
      this.logger.info(`create group directory data ${batchTxnDataForFile}`);
      return batchTxnDataForFile;       

    } catch (err) {
      this.logger.severe(`failed to new group directory ${groupDir}`);
      return [];
    }
  }

  ////////////////////////////////////////////////////////////////
  
  /**
   * Name:  saveLicense2TmpDir
   * Desc:  save license file content to tmp folder
   * Rtn:   object
   * Args:
   *        [data] license file content
   */
  async saveLicense2TmpDir(data) {
    const res = {status: false, fileName: '', err:''};
    const tmpFileName = Bzw2hUtils.getRandomString() + '.lic.tmp';
    const tmpLicFile = {
        path: path.join(this.bzw2hTmpDir, tmpFileName),
        data: data
    };
    const result = await this.dataSteward.addFile(tmpLicFile, true);
    if (result.status) {
      res.status = true;
      res.fileName = tmpFileName;
    }
    return res;
  }

  /**
     * Name:  saveClientConfig
     * Desc:  save both license file and bzw2h client config
     * Rtn:   object
     * Args:
     *        [payload] data object
     * payload = { data: data, license: { upload: false, fileName: ''} }
     * payload = { data: data, license: { upload: true,  fileName: 'xxxxxxx.lic.tmp'} }
     */
  async saveClientConfig(payload) {
    
    const batchTxnData = [];
    const res = {status: false, err: ''};

    // check args
    if (!payload || !payload.data || !payload.license) {
      res.err = 'Invalid data';
      return res;
    }

    // check if we need update license file
    let isUpdateLicFile = false;
    let tmpLicFile = '';
    if (payload.license.upload && payload.license.fileName) {
      // the license file has been updated
      isUpdateLicFile = true;
      const tmpFileName = payload.license.fileName;
      tmpLicFile = path.join(this.bzw2hTmpDir, tmpFileName);
      const result = Bzw2hUtils.readData4BzdbRawFile(tmpLicFile);
      if (!result.status) {
        res.err = result.err;
        this.logger.severe(`[Bzw2hConfigService::saveClientConfig] update license failed. ${res.err}`);  // BZ-15478
        return res;
      }
      const licData = { /*fileName: 'bluezone.lic',*/ data: result.data };
      batchTxnData.push({
        dataEntityName: 'w2hLicense', options: {}, action: 'UPDATEORINSERT', value: licData 
      });
    }

    // update client config
    const configData = {
      data: payload.data,
      fileName: 'web2hServerSettings.json'
    }
    batchTxnData.push({
      dataEntityName: 'configurations', options: {}, action: 'UPDATEORINSERT', value: configData 
    });
    try {
        const result = await bzdb.batchTxn(batchTxnData);
        if (!result.status) {
          res.err = result.message;
          this.logger.severe(`[Bzw2hConfigService::saveClientConfig] update config failed. ${res.err}`);  // BZ-15478
        } else {
          res.status = true;
          this.logger.info(`Update BZW2H config file successfully`);
          this.logger.debug(`Update BZW2H config file successfully: ${JSON.stringify(payload)}`);
        }
    } catch(error) {
      res.err = 'Unknown error';
      this.logger.severe(`[Bzw2hConfigService::saveClientConfig] update config failed. ${JSON.stringify(error)}`); //BZ-15478
    }
    
    if (isUpdateLicFile) {
      Bzw2hUtils.unlinkSync(tmpLicFile);  // remove temp license file
    }
    return res;
  }

} // end class

module.exports = {
  init(context) {
    if (!context.plugin.bzw2hConfig) {
      context.plugin.bzw2hConfig = new Bzw2hConfigService(context);
    }
    return context.plugin.bzw2hConfig;
  }
};
