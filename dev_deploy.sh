#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status.

REMOTE_USER="root"
REMOTE_HOST="139.180.201.180"
REMOTE_APP_DIR="/root/trade_compass_be"
SSH_KEY="/c/Users/tomas/.ssh/id_rsa"
SSH_OPTS="-i $SSH_KEY"
PM2_APP_NAME="trade-compass-be"
# Ensure pm2 commands run correctly even if the app isn't initially running
PM2_START_CMD="pm2 start ./dist/app/server.js --name $PM2_APP_NAME --time -f"
PM2_RESTART_CMD="pm2 restart $PM2_APP_NAME --time -f || $PM2_START_CMD"

echo "Starting development deployment (rsync)..."

# 1. Build locally
echo "Building project locally..."
npm run build

# 2. Sync dist folder using rsync
echo "Syncing dist folder to $REMOTE_HOST..."
# Ensure remote parent directory exists and remove old dist directory
ssh $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_APP_DIR && rm -rf $REMOTE_APP_DIR/dist"
# Use scp to copy the local dist folder recursively
scp -r $SSH_OPTS ./dist "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR/"
# Also copy package.json, tsconfig.json, and .env
scp $SSH_OPTS package.json tsconfig.json .env "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR/"

# 3. Install dependencies on remote server
echo "Installing dependencies on $REMOTE_HOST..."
ssh $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_APP_DIR && npm install"

# 4. Restart PM2 on remote server
echo "Restarting application '$PM2_APP_NAME' on $REMOTE_HOST..."
ssh $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_APP_DIR && $PM2_RESTART_CMD"

echo "Development deployment finished successfully."

exit 0 