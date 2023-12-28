#! /bin/sh
echo "Are you sure to reset 'SuperAdmin' password to default [y/n]?"
read yn
case $yn in
[yY][eE][sS]|[yY] )
# cd ../deploy/product/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth
# file=spadmahtctidt.json
# if [[ -f $file ]];then
#  rm $file;
# fi
filePath=../deploy/product/ZLUX/pluginStorage/com.rs.bzadm/_internal/services/auth;
# cp spadmahtctidt.json $filePath;
file=$filePath/spadmahtctidt.json
if [ -f $file ];then
 rm -f $file;
fi
echo "'SuperAdmin' password have been reset to default";;
[nN][oO]|[nN] )
echo "Cancelled reset 'SuperAdmin' password.";;
* ) 
echo "Please answer yes or no";;
esac
