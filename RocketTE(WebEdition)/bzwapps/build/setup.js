'use strict';
const jsonUtils = require('../lib/zlux/zlux-proxy-server/js/jsonUtils.js');
const encryptor = require('../lib/zlux/zlux-proxy-server/js/encryption.js');
const readerUtils = require('../lib/zlux/zlux-proxy-server/js/reader.js');
const Enquirer  =require ('../lib/zlux/zlux-proxy-server/js/node_modules/enquirer');

// var commandArgs = process.argv.slice(2);
const net = require('net');
const fs = require('../lib/zlux/zlux-proxy-server/js/node_modules/fs-extra');
const path = require('path');
const os = require('os');
const https = require('https');
const util = require('util');
const process = require ('process');
// const childProcess = require('child_process');
// const spawn = childProcess.spawn;
// const exec = childProcess.exec;
//const r = new readerUtils();
//const reader = r.readlineReader;
//const enquirer = r.enquirer;
const enquirer = new Enquirer();
 
const PATH_CONFIG_INSTANCE = path.join(__dirname, '../deploy/instance/ZLUX/serverConfig/zluxserver.json');

// const folderPosition = 3;
// const userRoleLocation = '../deploy/instance/BZW/pluginStorage/com.rs.internalAuth/_internal/plugin';
// const filename = 'userRoles.json';
// const userLocation = '../deploy/instance/users/admin/BZW/account/login.json';

const tokenKey = ';lavoi312-23!!230(;as^alds8*.mv%';
const tokenIv = '2%&_=AVad1!;sa[}';
const osType = os.type();
const isWinOS = osType.indexOf("Windows") !== -1;

// function readerSubstituteStar(question, callback) {
//   var stdin = process.openStdin();
//   process.stdin.on('data', function (c) {
//     c += '';
//     switch (c) {
//       case '\n':
//       case '\r':
//         stdin.pause();
//         break;
//       default:
//         process.stdout.write('\b*');
//     }
//   });
//   reader.question(question, function (answer) {
//     callback(answer);
//     reader.history = reader.history.slice(1); //do not retain the history of the password for future questions    
//   });
// }

/*
1. scan for authentication types
2. allow to choose a default
3. update server file
4. if fallback chosen, allow to create a username
5. choose ports
6. update server file
7. make bzwserver file backup
8. run deploy
*/
let useHttp = true;
let useHttps = true;
let httpPort = 8543;
let httpsPort = 8544;
let https_type = "";
let https_keys = "";
let https_certificates = "";
let https_Token = "";
let https_PFX = "";
const foldersArray = [
  "../deploy",
  "../deploy/site",
  "../deploy/site/ZLUX",
  "../deploy/site/ZLUX/plugins",
  "../deploy/site/ZLUX/pluginStorage",
  "../deploy/site/ZLUX/serverConfig",
  "../deploy/instance",
  "../deploy/instance/ZLUX",
  "../deploy/instance/ZLUX/plugins",
  "../deploy/instance/ZLUX/pluginStorage",
  "../deploy/instance/ZLUX/serverConfig",
  "../deploy/instance/users",
  "../deploy/instance/groups"
];
const copysArray = [
  { "from": "../config/server/zluxserver.json", "to": "../deploy/product/ZLUX/serverConfig/" },
  { "from": "../deploy/product/ZLUX/plugins/", "to": "../deploy/instance/ZLUX/plugins/" },
  { "from": "../config/server/logging.json", "to": "../deploy/instance/ZLUX/serverConfig/" },
  { "from": "../config/server/securityHeader.json", "to": "../deploy/instance/ZLUX/serverConfig/" },
  { "from": "../config/server/zluxserver.json", "to": "../deploy/instance/ZLUX/serverConfig/" },
  { "from": "../deploy/product/ZLUX/pluginStorage/com.rs.bzadm/configurations/dataSourceSetting.json", "to": "../deploy/instance/ZLUX/pluginStorage/com.rs.bzadm/configurations/" },
  { "from": "../deploy/product/ZLUX/pluginStorage/com.rs.bzadm/configurations/dataSourceSetting.json", "to": "../deploy/instance/ZLUX/pluginStorage/com.rs.bzw/configurations/" },
];
const CONFIG_FILES_DIR = "../deploy/instance/ZLUX/serverConfig";
const BACKUP_DIR = './backup';
const batFiles = ['./RTEDeploy.bat', './bzwDeployZowe.bat', './resetSuperAdminPassword.bat', './RTEBackup.bat',
  '../bin/nodeServer.bat', '../bin/shutdown.bat', '../bin/status.bat', '../bin/serviceCreate.bat', '../bin/serviceDelete.bat'];
const shFiles = ['./RTEDeploy.sh', './bzwDeployZowe.sh', './RTEFileTagging.sh', './resetSuperAdminPassword.sh', './RTEBackup.sh',
  '../bin/nodeServer.sh', '../bin/nodeServer-docker.sh', '../bin/shutdown.sh', '../bin/status.sh',
  '../bin/nodeServerZ.sh', '../bin/shutdownZ.sh', '../bin/statusZ.sh'];

const generateQuestion = function (message, type, name) {
  return {
    type: type || 'input',
    name: name || 'question',
    message: message || 'Question',
    symbols: { 
      prefix: {
        pending: '?',
		submitted: '$',
        cancelled: 'X'
      },
      separator: '>>'
    }
  };
}
let configJSON = null;  //this should load data after revert process

const gethostSpicificIp=function(){  //undefined means 0.0.0.0
  return configJSON.node || undefined 
}


const questionHTTP = function () {
  enquirer.prompt(generateQuestion('Configure server for HTTP? [y/n]: '))
    .then(response => {
      let useHttpA = response.question;
      useHttpA = useHttpA.toLowerCase();
      if (useHttpA === 'y') {
        useHttp = true;
        questionHTTPPort();
      } else if (useHttpA === 'n') {
        useHttp = false;
        questionHTTPS();
      } else {
        console.log('Invalid value. Please input "y" to use HTTP, or "n" to not use HTTP');
        questionHTTP();
      }
    })
    .catch(e => {
      if (e && e.message) {
        exitDeploy(1, `Exception occurs: ${e.message}`);
      }
    });
};

const isInteger = function(input) {
  const number = Number(input);
  return number != NaN && Number.isInteger(number);
}

const questionHTTPPort = function () {
  enquirer.prompt(generateQuestion('Input a port number (80, or between 1025-65535) [Default: 8543]: '))
  .then(response => {
    const httpPortA = response.question;
    if (isInteger(httpPortA)) {
      const portA = parseInt(httpPortA);
      if (!httpPortA || httpPortA.length === 0) {
        console.log('Set HTTP port number as default value: 8543.');
        questionHTTPS();
      }
      else if ((portA === 80) || (portA > 1024 && portA <= 65535)) {
        httpPort = portA;
        console.log('Set HTTP port number as: ' + portA + '.');
        questionHTTPS();
      } else {
        console.log('Invalid port number. Please input an integer which is 80 or between 1025-65535.');
        questionHTTPPort();
      }
    } else {
      console.log('Invalid port number. Please input an integer which is 80 or between 1025-65535.');
      questionHTTPPort();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const questionHTTPS = function () {
  enquirer.prompt(generateQuestion('Configure server for HTTPS? [y/n]: '))
  .then(response => {
    let useHttpsA = response.question;
    useHttpsA = useHttpsA.toLowerCase();
    if (useHttpsA == 'y') {
      useHttps = true;
      questionHTTPSPort();
    } else if (useHttpsA === 'n') {
      useHttps = false;
      if (!useHttps && !useHttp) {
        // console.log('ERROR: Please do configuration for HTTP or HTTPS.');
        // questionHTTP();
        exitDeploy(0);
      } else {
        updateConfig();
      }
    } else {
      console.log('Invalid value. Please input "y" to use HTTPS, or "n" to not use HTTPS');
      questionHTTPS();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const questionHTTPSPort = function () {
  enquirer.prompt(generateQuestion('Input a port number (443, or between 1025-65535) [Default: 8544]: '))
  .then(response => {
    const httpsPortA = response.question;
    if (isInteger(httpsPortA)) {
      const portA = parseInt(httpsPortA);
      if (!httpsPortA || httpsPortA.length === 0) {
        console.log('Set HTTPS port number as default value: 8544.');
        qSpecifyCertification();
      } else if ((portA === 443) || (portA > 1024 && portA <= 65535)) {
        httpsPort = portA;
        console.log('Set HTTPS port number as: ' + portA + '.');
        qSpecifyCertification();
      } else {
        console.log('Invalid port number. Please input an integer which is 443 or between 1025-65535');
        questionHTTPSPort();
      }
    } else {
      console.log('Invalid port number. Please input an integer which is 443 or between 1025-65535');
      questionHTTPSPort();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const isValidFile = function (file, exts) {
  const ext = (path.extname(file)).toLowerCase();
  // console.log('current ext: ' + ext);
  // console.log('current exts: ' + exts);
  return fs.existsSync(file) && exts.indexOf(ext) > -1;
}

const getFilePath = function (sourceFile, targetDir) {
  let filePath = path.join(targetDir, path.basename(sourceFile));
  return filePath.replace(/\\/g, "/");
}

const handleFilePath = function (inputPath) {
  const relativePath = path.relative(__dirname, inputPath);
  return relativePath.replace(/\\/g, "/");
}

const qSpecifyCertification = function () {
  enquirer.prompt(generateQuestion('Specify certification method, please input "pfx" or "cer" : '))
  .then(response => {
    const type = response.question;
    if (type === 'pfx' || type === 'cer') {
      if (type === 'pfx' && osType === 'OS/390') {
        console.log(`\n(Ensure the file is tagged to binary, if not, run "$ chtag -b filename" first!)\n`);
      }
      if (type === 'cer' && osType === 'OS/390') {
        console.log(`\n(Ensure the file is tagged, if not, run "$ chtag -tc819 filename" first!)\n`);
      }
      https_type = type;
      qCertificationFile1();
    } else {
      console.log('Invalid certification method. Please input "pfx" or "cer"!');
      qSpecifyCertification();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const qCertificationFile1 = function () {
  const fileType = https_type === 'pfx' ? ['.pfx', '.p12'] : ['.cer', '.crt', '.cert', '.pem'];
  // To avoid input content cannot be seen problem when exceed 80 characters on BZD/BZW (no problem on PUTTY)
  console.log(`Specify the path of ${https_type} file with extension ${fileType.join('/')}`);
  enquirer.prompt(generateQuestion('File path: '))
  .then(response => {
    const filePath = response.question;
    if (filePath) {
      if (!isValidFile(filePath, fileType)) {
        console.log('Please input a valid file path!');
        qCertificationFile1();
      } else {
        const copyTarget = getFilePath(filePath, CONFIG_FILES_DIR);
        const determineSamePath = path.relative(filePath, copyTarget); // if the same path, return a empty string
        if (determineSamePath) {
          fs.copyFileSync(filePath, copyTarget);
        }
        if (https_type === 'pfx') {
          // https_PFX = handleFilePath(filePath);
          https_PFX = copyTarget;
          qCertificationToken({
            pfx: fs.readFileSync(path.join(__dirname, https_PFX)),
            passphrase: ''
          });
        } else {
          // https_certificates = handleFilePath(filePath);
          https_certificates = copyTarget;
          qCertificationFile2()
        }
      }
    } else {
      console.log(' Please input a valid file path!');
      qCertificationFile1();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const qCertificationFile2 = function () {
  const fileType = ['.key', '.pem'];
  console.log(`Specify the path of key file with extension ${fileType.join('/')}`);
  enquirer.prompt(generateQuestion('File path: '))
  .then(response => {
    const keyFile = response.question;
    if (keyFile) {
      if (!isValidFile(keyFile, fileType)) {
        console.log('Please input a valid file path!');
        qCertificationFile2();
      } else {
        const copyTarget = getFilePath(keyFile, CONFIG_FILES_DIR);
        const determineSamePathForKey = path.relative(keyFile, copyTarget); // if the same path, return a empty string
        if (determineSamePathForKey) {
          fs.copyFileSync(keyFile, copyTarget);
        }
        // https_keys = handleFilePath(keyFile);
        https_keys = copyTarget;
        qCertificationToken({
          cert: fs.readFileSync(path.join(__dirname, https_certificates)),
          key: fs.readFileSync(path.join(__dirname, https_keys)),
          passphrase: ''
        });
      }
    } else {
      console.log('Please input a valid file path!');
      qCertificationFile2();
    }
  })
  .catch(e => {
    if (e && e.message) {
      exitDeploy(1, `Exception occurs: ${e.message}`);
    }
  });
};

const qCertificationToken = function (options) {
  https_Token = '';
  console.log('Please input passphrase for certification: <Press Enter if no passphrase>')
  enquirer.prompt(generateQuestion('Passphrase: ', 'password'))
  .then(response => {
    options.passphrase = response.question;
    console.log(`Start checking passphrase...`);
    getPort().then(port => {
      const testServer = https.createServer(options, (req, res) => {
        res.writeHead(200);
        res.end('Verify certificate success.\n');
      }).listen(port,gethostSpicificIp());
      console.log('Correct passphrase!');
      testServer.close();
      const en = new util.TextEncoder();
      https_Token = encryptor.encryptWithKeyAndIV(options.passphrase, en.encode(tokenKey), en.encode(tokenIv));
      updateConfig();
    })
    .catch(e => {
      // console.log('Error occurs', JSON.stringify(e));
      if (e && e.message) {
        if (e.message === 'mac verify failure' || e.message.indexOf('bad decrypt') > -1) {
          console.log('Incorrect passphrase!');
          options.passphrase = '';
          qCertificationToken(options);
        } else if (e.message === 'wrong tag') {   // for pfx
          exitDeploy(1, `Wrong tag of the certification file, please run "$ chtag -b filename" first!`);
        } else if (e.message.indexOf('no start line')>-1) {   // for cer
          exitDeploy(1, `Wrong tag of the certification file, please run "$ chtag -tc819 filename" first!`);
        } else if (e.message.indexOf('unsupport')>-1) {   // for cer
          exitDeploy(1, `Current Nodejs version doesn't support this certificate`);
        }
		
        else {
          exitDeploy(1, `Exception occurs: ${e.message}`);
        }
      }
    });
  })
  .catch(e => {
    exitDeploy(1, `Exception occurs: ${e.message}`);
  });
};

const getPort = function() {
  let port = 8010;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', (err) => {
      if(++port<65536){ //stop the check port  
        server.listen(port,gethostSpicificIp());
      }else{
        reject({'message':'Unable to validate the certificate. No port available or port is reserved. Please try via the Administrator web console after configuring only HTTP.'})
      }
    });
    server.on('listening', () => server.close(() => resolve(port)));
    server.listen(port,gethostSpicificIp());
  });
}

const exitDeploy = function (exitCode, message) {
  const defaultMessage = '\nDeploy completed! Please start server to apply the configurations.\n';
  const deployMessage = message ? message : defaultMessage;
  console.log(deployMessage);

  if (isWinOS) {
    setTimeout(() => {
      process.exit(exitCode);
    }, 5000);
  } else {
    process.exit(exitCode);
  }
}

const updateConfig = function () {
  try {
    

    if (!useHttp && configJSON.node.http) delete configJSON.node.http;
    if (!useHttps && configJSON.node.https) delete configJSON.node.https;

    if (useHttp) {
      configJSON.node.http = { "port": httpPort };
    }

    if (useHttps) {
      configJSON.node.https = { "port": httpsPort };
      if (https_type === 'pfx') {
        configJSON.node.https.pfx = https_PFX;
        configJSON.node.https.token = https_Token;
      } else if (https_type === 'cer') {
        configJSON.node.https.keys = [https_keys];
        configJSON.node.https.certificates = [https_certificates];
        configJSON.node.https.tokens = [https_Token];
      }
    }

    fs.writeFileSync(PATH_CONFIG_INSTANCE, JSON.stringify(configJSON, null, 2), { encoding: 'utf8', mode: 0o644 }); //should we overwrite the default??
    // process.exit(0);
    exitDeploy(0);
    /*console.log('---- Administrative configuration ----');
    console.log('This software\'s server requires an administrative account to configure services, user access and privileges.');
    makeAuthFolder();*/
  } catch (e) {
    // process.exit(1);
    exitDeploy(1, `Deploy failed, error message: ${e.message}\n`);
  }
};

// const adminSetup = function () {
//   readerSubstituteStar('Please enter a password for the user "admin": ', (answer) => {

//     accountHandler.createUser('admin', answer, userLocation, () => {
//       accountHandler.modifyUserRoles(['admin'], ['administrator'], null, null, path.join(userRoleLocation, filename), () => {
//         console.log('Admin setup complete.');
//         process.exit(0);
//       }, (err) => {
//         console.log('Error updating user role = ' + err);
//       });
//     }, (err) => {
//       console.log('Error creating user = ' + err);
//     });
//   });
// };

// const makeAuthFolder = function () {
//   var nextSlashPos = userRoleLocation.indexOf('/', folderPosition);
//   if (nextSlashPos == -1) {
//     var folderName = userRoleLocation;
//     fs.mkdir(folderName, 0o777, (err) => {
//       //move on
//     });

//     var userRolePath = path.join(userRoleLocation, filename);
//     try {
//       fs.accessSync(userRolePath, fs.constants.F_OK);
//     }
//     catch (e) {
//       console.log(' Creating user role file...');
//       try {
//         fs.writeFileSync(userRolePath, JSON.stringify({}), { encoding: 'utf8' });
//       } catch (er) {
//         console.log(' Could not create user role file.');
//         throw er;
//       }
//     }
//     setTimeout(adminSetup, 500);
//   }
//   else {
//     var folderName = userRoleLocation.slice(0, nextSlashPos);

//     fs.mkdirSync(folderName, 0o777, (err) => {
//       folderPosition = nextSlashPos + 1;
//       makeAuthFolder();
//     });
//   }
// };

const copyFileSync = function (source, target) {
  var targetFile = target;
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }
  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

const copyFolderRecursiveSync = function (source, target) {
  var files = [];
  if (!fs.existsSync(source) || !fs.existsSync(target)) {
    return;
  }
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, target);
      } else {
        copyFileSync(curSource, target);
      }
    });
  } else {
    copyFileSync(source, target);
  }
}

const createFolder = function () {
  console.log('\n1: Creating folders...');
  foldersArray.forEach(element => {
    if (!fs.existsSync(element)) {
      fs.mkdirSync(element, [true, 0o777], (err) => {
        console.log(' Can not create folder' + element);
      });
    } else {
      // console.log('alreay exist '+element)
    }
  });
  console.log('All folders have been created');
}

const copyDefaultFiles = function () {
  copysArray.forEach(element => {
    copyFolderRecursiveSync(element.from, element.to);
  });
  console.log('Finished to reset the settings.');
}

const setServerConfig = function () {
  console.log('\n4: Server configuration ');
  console.log('Rocket TE Web Edition uses a server that can be run on HTTP, HTTPS, or both.');
  questionHTTP();
}

const customizeSettings = function () {
  if (!fs.existsSync(PATH_CONFIG_INSTANCE)) {
    copyDefaultFiles();
    configJSON = jsonUtils.parseJSONWithComments(PATH_CONFIG_INSTANCE)
    setServerConfig();
  } else {
    enquirer.prompt(generateQuestion('Do you want to reset all the settings to default value? [y/n]:'))
    .then(response => {
      let isRevet = response.question;
      isRevet = isRevet.toLowerCase();
      if (isRevet === 'y' || isRevet === 'n') {
        if (isRevet === 'y') {
          copyDefaultFiles();
        } else {
          console.log('Skip to reset the settings.');
        }
        configJSON = jsonUtils.parseJSONWithComments(PATH_CONFIG_INSTANCE);
        setServerConfig();
      } else {
        console.log('Invalid value. Please input "y" to reset settings, or "n" to skip.');
        customizeSettings();
      }
    })
    .catch(e => {
      if (e && e.message) {
        exitDeploy(1, `Exception occurs: ${e.message}`);
      }
    });
  }
}

const backupExecutiveFiles = function () {
  const backupType = isWinOS ? '.sh' : '.bat';
  console.log(`\n2: Cleaning useless ${backupType} files...`)
  const backupFiles = isWinOS ? shFiles : batFiles;

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  backupFiles.forEach(file => {
    if (fs.existsSync(file)) {
      fs.renameSync(file, getFilePath(file, BACKUP_DIR));
    }
  });
  console.log(`Useless ${backupType} files have been cleaned.`);

  // consider for a special condition: same builder run on different OS
  // need copy files back from backup dir
  // const keepFiles = isWinOS ? batFiles : shFiles;
  // keepFiles.forEach(file => {
  //   if (!fs.existsSync(file)) {
  //     let backupFile = getFilePath(file, BACKUP_DIR);
  //     if (fs.existsSync(backupFile)) {
  //       fs.copyFileSync(backupFile, file);
  //     } else {
  //       // console.log(`Error occurs: ${file} is missing`);
  //     }
  //   }
  // });
}

var deploy = function () {
	
  console.log('\n/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/\n' +
    '|                                                               |\n' +
    '|                                                               |\n' +
    '|                  WELCOME TO ROCKET TE WEB EDITION             |\n' +
    '|                                                               |\n' +
    '|                                                               |\n' +
    '/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/\n');
  console.log(`node arguments are:`);
  process.argv.forEach((val, index) => {
	  console.log(`${index}: ${val}`);
  });
  console.log('Starting to deploy for Rocket TE Web Edition.');
  createFolder();
  backupExecutiveFiles();
  console.log('\n3: Reset settings');
  customizeSettings();
}

deploy();







