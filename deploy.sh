#!/bin/bash

# Simple deploy script for MVP
ssh -i /c/Users/tomas/.ssh/id_rsa root@139.180.201.180 << 'ENDSSH'
  cd ./trade_compass_be
  git pull origin master
  npm install
  npm run build
  pm2 restart trade-compass-be --time -f || pm2 start ./dist/index.js --name trade-compass-be --time -f
ENDSSH
