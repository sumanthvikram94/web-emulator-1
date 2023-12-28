const fs = require('../lib/zlux/zlux-proxy-server/js/node_modules/fs-extra');
const path = require('path');
const os = require('os');

const osType = os.type();
const isWinOS = osType.indexOf("Windows") !== -1;
// const sourceFolders = [
//   '../deploy/instance/groups',
//   '../deploy/instance/users',
//   '../deploy/instance/ZLUX/pluginStorage',
//   '../deploy/instance/ZLUX/serverConfig'
// ];

// JSTE-5167: backup the whole instance folder
// revert data: remove deploy/instance folder, then copy instance folder from backup data
const sourceFolders = [
  '../deploy/instance'
];

const formatDateNumber = (data) => {
  const dataStr = `${data}`;
  return dataStr.length === 1 ? `0${dataStr}` : dataStr;
}

/**
 * return the date info as 'YYYYMMDDhhmmss'
 */
const getDateInfo = () => {
  const dateObj = new Date();
  const year = formatDateNumber(dateObj.getFullYear());
  const month = formatDateNumber(dateObj.getMonth() + 1);
  const day = formatDateNumber(dateObj.getDate());
  const hour = formatDateNumber(dateObj.getHours());
  const minutes = formatDateNumber(dateObj.getMinutes());
  const seconds = formatDateNumber(dateObj.getSeconds());
  return `${year}${month}${day}${hour}${minutes}${seconds}`;
}

const copyFileSync = function(source, target) {
  let targetFile = target;

  //if target is a directory a new file with the same name will be created
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.copyFileSync(source, targetFile);
}

const copyFolderRecursiveSync = function(source, target) {
  let files = [];

  //check if folder needs to be created or integrated
  let targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }

  //copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(file => {
      let curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

/**
 * Creates the dir and the parent dirs if not exist.
 * @param {string} dir
*/
const createDirs = function(dir) {
  const tmpPath = dir;
  if (!fs.existsSync(path.dirname(tmpPath))) {
    createDirs(path.dirname(tmpPath));
  }
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath);
  }
}

const exitBackup = function (exitCode, message) {
  const defaultMessage = '\nBackup data completed!\n';
  const backupMessage = message ? message : defaultMessage;
  console.log(backupMessage);

  if (isWinOS) {
    setTimeout(() => {
      process.exit(exitCode);
    }, 3000);
  } else {
    process.exit(exitCode);
  }
}

const backupFiles = function () {
  try {
    const dateInfo = getDateInfo();
    const backup_dir = `./backup/deploy_${dateInfo}`;
    // BZW & BZD cannot auto wrap to new line; PUTTY works well
    // console.log(`Backup data from bzwapps/deploy/instance to bzwapps/build/backup/deploy_${dateInfo}/instance`);
    console.log(`Backing up data from bzwapps/deploy/instance to`);
    console.log(`bzwapps/build/backup/deploy_${dateInfo}/instance`);

 
    sourceFolders.forEach(sourceFolder => {
      if (fs.existsSync(sourceFolder)) {
        let targetFolder = sourceFolder.indexOf('/ZLUX/') > -1 ? `${backup_dir}/ZLUX` : backup_dir;
        if (!fs.existsSync(targetFolder)) {
          createDirs(targetFolder);
        }
        copyFolderRecursiveSync(sourceFolder, targetFolder);
      }
    });

    exitBackup(0);
  }
  catch(e) {
    if (e && e.message) {
      exitBackup(1, `Exception occurs: ${e.message}`);
    }
  }
}

const backup = function () {
  console.log('\nStarting to back up data for Rocket TE Web Edition...\n');
  backupFiles();
}

backup();