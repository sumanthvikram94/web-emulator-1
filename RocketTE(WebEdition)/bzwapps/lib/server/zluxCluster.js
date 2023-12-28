'use strict';

try {
    (
      //ok to require within function - only called once, at startup
      function(){
        const process = require('process');

        if (process.pid) {
          
          const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
          fs.appendFile('../lib/server/pid.txt', process.pid + ',', (err) => {
            if (err) throw err;
            // else success
            console.log('BZW PID = ' + process.pid + ' stored OK');
          });
          
        }
      }()
    );
  } catch(err) {
    console.log('WritePid Failed: '+err.msg);
  }

process.env.APP_MODE = 'STANDALONE';
const clusterManager = require('../zlux/zlux-proxy-server/js/clusterManager').clusterManager;
const {appConfig, configJSON, startUpConfig} = require('./zluxArgs')();

clusterManager.start(appConfig, configJSON, startUpConfig);

//run as:
//node --harmony zluxCluster.js --config=../deploy/instance/ZLUX/serverConfig/zluxserver.json -h <z/os system> -P <zssPort>