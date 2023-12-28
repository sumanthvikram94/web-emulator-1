
var fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
var cp = require('child_process');
var usage = 'Usage:\r\n';
usage+='node shutdown.js [path to pid file]';

try {
  
  var args = process.argv.slice(2);
  var pidfile = args[0];
  var isWin = (process.platform.indexOf('win')!=-1);
  
  // confirm path to pid file
  if (!pidfile) {
    console.log("Missing Argument: PID File Path");
    console.log(usage);
  }
  
  // read in the pid
  fs.readFile(pidfile,{encoding:'utf-8'},(err,data)=>{
    onPidFound(data);
  });

  function onPidFound(pids) {
    if (!pids) {
      console.log('Server not started yet.');
      return 0;
    }
    console.log('pids read:'+pids);
    const pid=pids.split(',')[0];
    console.log('pid to kill:'+pid);
    if(isWin) {
      winShutdown(pid);
    } else {
      nixShutdown(pid);
    }
    deletePidFile();
    console.log('Shutdown PID '+pid+' OK, Platform '+process.platform+', Flag Removed = '+(!fs.existsSync(pidfile)));
  }
  
  function winShutdown(pid) {
    //console.log('windows shutdown');
    cp.exec('taskkill /PID '+pid+' /F');
  }
  
  function nixShutdown(pid) {
    //console.log('*nix shutdown');
    cp.exec('kill '+pid);
  }
  
  function deletePidFile() {
    fs.unlink(pidfile,function(err){
      if(err) throw err;
    });
  }
  
} catch(err) {
  console.log(err);
}


/*

set PID_FILE=..\js\pid.txt

set /p pid=<%PID_FILE%
echo PID=%pid%

rem must use /f to force kill - graceful shutdown request fails
taskkill /PID %pid% /F

del %PID_FILE%
 
 */