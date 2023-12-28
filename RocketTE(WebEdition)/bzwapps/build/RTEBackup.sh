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

node --harmony backup.js

cd $CURDIR
