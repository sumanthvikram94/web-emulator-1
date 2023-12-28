#!/bin/sh
# 

export cdir=`pwd`
export dir=`dirname "$0"`
echo "Command is executed in: $cdir"
cd "$dir"
export dir=`pwd`
echo "Working dir is: $dir"

echo "---------------------------------------------------------------------"
echo "Checking environment variables"

# Ensure node.js installation
echo "NODE_HONE=${NODE_HOME}"
if [ -z ${NODE_HOME} ]
then
  echo "WARN - NODE_HOME environment variable not defined, will use the node.js in PATH"
else
  echo "Adding NODE_HOME to PATH"
  export PATH=${NODE_HOME}/bin:$PATH
fi

ZLUX_NODE_LOG_DIR="../log"

if [ -f "$ZLUX_NODE_LOG_DIR" ]
then
  ZLUX_NODE_LOG_FILE=$ZLUX_NODE_LOG_DIR
elif [ ! -d "$ZLUX_NODE_LOG_DIR" ]
then
  echo "Will make log directory $ZLUX_NODE_LOG_DIR"
  mkdir -p $ZLUX_NODE_LOG_DIR
  if [ $? -ne 0 ]
  then
    echo "Cannot make log directory.  Logging disabled."
    ZLUX_NODE_LOG_FILE=/dev/null
  fi
fi

export NODE_PATH=${dir}/../lib/zlux/zlux-proxy-server/js/node_modules:${NODE_PATH}
echo "NODE_PATH=${NODE_PATH}"
export PATH=${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin:$PATH

export PM2_HOME=${dir}/../lib/server/.pm2/

# Ensure z/OS specific env
type chtag > /dev/null 2>&1 # Here is not checking the OS version, but check whether the chtag command exists.
if [ $? -eq 0 ];then
  echo "Exporting z/OS specific ENV variables"
  export "_CEE_RUNOPTS=XPLINK(ON),HEAPPOOLS(ON)"
  export _BPXK_AUTOCVT=ON
  export _TAG_REDIR_ERR=txt
  export _TAG_REDIR_IN=txt
  export _TAG_REDIR_OUT=txt
fi

echo 
echo "Check below file for full list of environment variables if need:"
echo "${dir}/env_list.tmp"
env > "${dir}/env_list.tmp"

echo "---------------------------------------------------------------------"
echo "Checking node.js installation"
if [ -z `command -v node` ]
then
  echo "ERROR: node.js executable not found"
  echo "Please set node.js installation path as the value of env variable: \"NODE_HOME\""
  cd "$cdir"
  exit 1
fi
type node

echo "---------------------------------------------------------------------"
echo "Checking server deployment"

# This make sure the format of config file is as expectation
node --harmony "${dir}/../lib/server/formatConfig.js"
exitcode=$?
if [ "$exitcode" -ne 0 ]; then
  echo "Failed to format the config file, please check the ${dir}/../lib/server/windowServer.json"
  sleep 10
  cd "$cdir"
  exit $exitcode
fi

SERVICE_DISP_NAME=`cat ../lib/server/windowServerFormat.json | grep '"name":' | cut -d \" -f 4`

if [ -z "$SERVICE_DISP_NAME" ]
then
  echo "Could not find the server name, please check the ${dir}/../lib/server/windowServer.json"
  cd "$cdir"
  exit 1
fi
echo "Server name is: \"${SERVICE_DISP_NAME}\""

if [ -d "../deploy/instance/ZLUX" ]
then
  echo "$dir/../deploy/instance/ZLUX exists"
else
  echo "Required instance dir missing, please run ${dir}/../build/bzwDeploy.sh"
  cd "$cdir"
  exit 0
fi

if [ -d "../deploy/product/ZLUX" ]
then
  echo "$dir/../deploy/product/ZLUX exists"
else
  echo "Required product dir missing, please run ${dir}/../build/bzwDeploy.sh"
  cd "$cdir"
  exit 0
fi

echo "---------------------------------------------------------------------"
echo "Clearing the pid record"
rm ../lib/server/pid.txt > /dev/null 2>&1

echo "---------------------------------------------------------------------"
echo "Checking server status"
#count=`ps -ef |grep "node.*/bzwapps/lib.*" |grep -v "grep" |wc -l` # this command can't guarantee BZW is online on z/OS 
sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" list > ../lib/server/pm2list.tmp 2>&1 # the output of pm2 list can't be greped directly on z/OS
count=`cat ../lib/server/pm2list.tmp | grep "${SERVICE_DISP_NAME}" | grep "online" |wc -l`
rm -f ../lib/server/pm2list.tmp #remove the temp file
if [ "$count" -eq 0 ]
then

  unameOut=`uname  -s`
  mac="Darwin"

  if [ $unameOut = $mac ]
  then
    cp ../lib/server/windowServer.json ../lib/server/config.json
    sed -i .bak  "s/#BZW_CWD#/./g" ../lib/server/config.json
  else
    sed "s+#BZW_CWD#+${dir}+g" ../lib/server/windowServer.json > ../lib/server/config.json
  fi

  node --harmony "../lib/server/preStartCheck.js"
  exitcode=$?
  # exitcode could be :
  #  - 0 if config.json not changed by preStartCheck.js
  #  - 1 if there is error
  #  - 200 if the config.json is changed for pfx passphrase or other reason
  # When exitcode is 200, the file needs a chtag on z/OS

  if [ "$exitcode" -ne 0 -a "$exitcode" -ne 200 ]; then
    echo Server pre-start check failed.
    cd "$cdir"
    exit $exitcode
  fi
  
  # on z/OS, The config.json needs a chtag after node.js change it's content...
  chtagcount=`command -v chtag | wc -l`
  if [ "$chtagcount" -ne 0 -a "$exitcode" -eq 200 ]; then
    chtag -tc819 ../lib/server/config.json
  fi

  echo "---------------------------------------------------------------------"
  echo "Starting server"
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" start ../lib/server/config.json > "${dir}/../log/nodeServer_start.log" 2>&1
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" list

  echo "---------------------------------------------------------------------"
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" list > ../lib/server/pm2list.tmp # the output of pm2 list can't be greped directly on z/OS
  count=`cat ../lib/server/pm2list.tmp | grep "${SERVICE_DISP_NAME}" | grep "online" |wc -l`
  rm -f ../lib/server/pm2list.tmp #remove the temp file
  if [ "$count" -eq 0 ]
  then
    echo "'${SERVICE_DISP_NAME}' start failed"
  else
    echo "Server starting completed"
  fi;

else
  echo "'${SERVICE_DISP_NAME}' is already running."
  echo "If you want to restart, please execute shutdown.sh and try again."
  # sh ../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2 restart "$SERVICE_DISP_NAME"
fi;

cd "$cdir"

