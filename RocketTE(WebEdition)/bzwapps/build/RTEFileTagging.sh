#!/bin/sh

# Before running this script edit the .profile file to add:
# _BPXK_AUTOCVT=ON
# as a new environment variable. This enables conversion of data between EBCDIC and ASCII code sets.

# Run this script before deploying and starting the BZW server.

# Purpose:
# 1) Adds read write execute permissions recursively for the current user.
# 2) Tags all image and media files to binary.
# 3) Tags all text files to ASCII

export cdir=`pwd`
export dir=`dirname "$0"`

# cd to bzwapps/build/
cd "$dir"

# remove .bat files
rm *.bat
rm ../bin/*.bat

cd ../..
echo "Adding read write execute permissions recursively for the current user"
chmod -R u+rwx bzwapps
echo "Tagging all image and media files to binary"
cd bzwapps/
find . \( -name *.jpg -o -name *.png -o -name *.gif -o -name *.mpg -o -name *.JPG -o -name *.PNG -o -name *.GIF -o -name *.crx -o -name *.eot -o -name *.ttf -o -name *.woff -o -name *.woff2 -o -name *.svg -o -name *.ico -o -name *.pfx -o -name *.dll -o -name *.dl_ -o -name *.exe -o -name *.ex_ -o -name *.af_ -o -name *.di_ -o -name *.cab -o -name *.jar \) -exec chtag -b {} \;
echo "Tagging all text files to ASCII"
find . -type f \( -name '*.js' -o -name 'pm2' -o -name '*.md' -o -name '*.txt' -o -name '*.json' -o -name '*.bat' -o -name '*.sh' -o -name '*.html' -o -name '*.css' -o -name '*.pdf' -o -name '*.htm' -o -name '*.cert' -o -name '*.cer' -o -name '*.key' -o -name '*.xml' -o -name '*.bzlp' -o -name '*.jnlp' -o -name '*.ini' -o -name '*.dst' -o -name '*.config' -o -name '*.lic' -o -name '*.properties' -o -name '*.default' -o -name '*.zmd' -o -name '*.zad' -o -name '*.zvt' -o -name '*.zmp' -o -name '*.zap' -o -name '*.z65' -o -name '*.zft' -o -name '*.mds' -o -name '*.ads' -o -name '*.vds' -o -name '*.6ds' -o -name '*.tn3' -o -name '*.tn5' -o -name '*.mdd' -o -name '*.add' -o -name '*.vdd' -o -name '*.6dd' -o -name '*.mdk' -o -name '*.adk' -o -name '*.vdk' -o -name '*.6dk' -o -name '*.mdf' -o -name '*.vdf' -o -name '*.6df' -o -name '*.mdp' -o -name '*.adp' -o -name '*.vdp' -o -name '*.6dp' -o -name '*.mdb' -o -name '*.adb' -o -name '*.vdb' -o -name '*.6db' -o -name '*.mdr' -o -name '*.adr' -o -name '*.vdr' -o -name '*.6dr' -o -name '*.pad' -o -name '*.vbs' -o -name '*.bbs' -o -name '*.bzs' -o -name '*.dic' -o -name '*.ts' -o -name '*.sql' -o -name 'LICENSE' -o -name 'license' -o -name '*.ts.map' -o -name '*.gyp' -o -name '*.yml' -o -name '*.yaml'  -o -name '*.cjs' \) -exec chtag -tc819 {} \;
echo "Tagging done"
echo "Ignore warnings related to tagging files inside of THIRDPARTY package."

cd "$cdir"
