#!/bin/sh

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

# Ensure z/OS specific env
type chtag > /dev/null 2>&1 # Here is not checking the OS version, but check whether the chtag command exists.
if [ $? -eq 0 ];then
  export "_CEE_RUNOPTS=XPLINK(ON),HEAPPOOLS(ON)"
  export _BPXK_AUTOCVT=ON
  export _TAG_REDIR_ERR=txt
  export _TAG_REDIR_IN=txt
  export _TAG_REDIR_OUT=txt
fi

export NODE_PATH=${dir}/../lib/zlux/zlux-proxy-server/js/node_modules:${NODE_PATH}
echo NODE_PATH=${NODE_PATH}
export PATH=${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin:$PATH

export PM2_HOME=${dir}/../lib/server/.pm2/

echo "Check below file for full list of environment variables if need:"
echo "${dir}/env_list.tmp"

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

SERVICE_DISP_NAME=`cat ../lib/server/windowServer.json | grep '"name":' | cut -d \" -f 4`

if [ -z "$SERVICE_DISP_NAME" ]
then
  echo "Could not find the server name, please check the server deployment"
  cd "$cdir"
  exit 1
fi
echo "Server name is: \"${SERVICE_DISP_NAME}\""

if [ -d "../deploy/instance/ZLUX" ]
then
  echo "${dir}/../deploy/instance/ZLUX exists"
else
  echo "Required instance dir missing, please run ${dir}/../build/bzwDeploy.sh"
  cd "$cdir"
  exit 0
fi

if [ -d "../deploy/product/ZLUX" ]
then
  echo "${dir}/../deploy/product/ZLUX exists"
else
  echo "Required product dir missing, please run ${dir}/../build/bzwDeploy.sh"
  cd "$cdir"
  exit 0
fi

echo "---------------------------------------------------------------------"
echo "Checking server status"
# This is to hide the warnings when pm2 deamon starts on node.js V14. 
# Seems node.js V14 doesn't like one of the pm2 dependencies: shelljs 
sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" list > /dev/null 2>&1
#Check whether the server already running
count=`sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" prettylist | grep "name: '${SERVICE_DISP_NAME}'" | wc -l`
if [ "$count" -eq 0 ]
then
  # sh ${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2 kill > /dev/null 2>&1  # This should be removed if allow multiple applications run on same server.
  echo "The server \"${SERVICE_DISP_NAME}\" is not running"
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" kill > /dev/null 2>&1
else
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2" show "$SERVICE_DISP_NAME"
fi

cd "$cdir"
