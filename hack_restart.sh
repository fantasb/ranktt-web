#!/bin/bash
# Note!: This is a temp hack for me. Do not use in real scripts
#

killall node
killall gulp
#export NODE_ENV=production
export NODE_ENV=
/root/sire/bin/angel.sh "/var/www/fsb-demo/algo/server.js" >> /var/log/angel.log 2>&1
/root/sire/bin/angel.sh "/var/www/ranktt-web/index.js" >> /var/log/angel.log 2>&1
