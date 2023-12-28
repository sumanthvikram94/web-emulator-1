#! /bin/sh

CURDIR=`pwd`
EXECDIR=$(cd `dirname $0` && pwd)
cd $EXECDIR

if [ -n $NODE_HOME ]
then
  export PATH=$NODE_HOME/bin:../lib/zlux/zlux-proxy-server/js/node_modules/.bin:$PATH
else
  echo WARN- NODE_HOME environment variable not defined, not setting PATH
fi
#get the node arguments from windowServer.json file
node_args=$(node ../lib/server/enviorment.js)
node $node_args setup.js $node_args
cd $CURDIR
