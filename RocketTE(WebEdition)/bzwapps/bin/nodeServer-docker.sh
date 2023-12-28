#! /bin/sh
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


if [ ! -d "../deploy/instance" ] && [ -d "../build/deployCopy" ]
then
  echo Copying content for deploy/instance folder
  cp -Rf ../build/deployCopy/instance ../deploy/instance
fi

if [ ! -d "../deploy" ]
then
  echo Making the deploy folder
  mkdir ../deploy
fi


SUB_FOLDER=`hostname`
echo Hostname is: ${SUB_FOLDER}

if [ -d ${RTEW_DEPLOY_SOURCE}/${SUB_FOLDER} ]
then
  echo The source folder of deploy exists as ${RTEW_DEPLOY_SOURCE}/${SUB_FOLDER}. Copying from source folder to deploy folder.
  mv /home/bzwapps/deploy /home/bzwapps/deploy-bk
  cp ${RTEW_DEPLOY_SOURCE}/${SUB_FOLDER} -rf /home/bzwapps/deploy
fi

if [ ! -d "../deploy/instance" ] && [ -d "../build/deployCopy" ]
then
  echo Copying content for deploy/instance folder
  cp -Rf ../build/deployCopy/instance ../deploy/instance
fi

if [ ! -d "../deploy/product" ] && [ -d "../build/deployCopy" ]
then
  echo Copying content for deploy/product folder
  cp -Rf ../build/deployCopy/product ../deploy/product
fi

if [ ! -d "../deploy/site" ] && [ -d "../build/deployCopy" ]
then
  echo Copying content for deploy/site folder
  cp -Rf ../build/deployCopy/site ../deploy/site
fi

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
sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2-runtime" list > ../lib/server/pm2list.tmp # the output of pm2 list can't be greped directly on z/OS
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
    echo Server pre-start check failed. This command will close in 10 seconds.
    sleep 10
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
  sh "${dir}/../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2-runtime" start ../lib/server/config.json
else
  echo "'${SERVICE_DISP_NAME}' is already running."
  echo "If you want to restart, please execute shutdown.sh and try again."
  # sh ../lib/zlux/zlux-proxy-server/js/node_modules/.bin/pm2-runtime restart "$SERVICE_DISP_NAME"
fi;

cd "$cdir"

