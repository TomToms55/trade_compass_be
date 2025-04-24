#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status.

REMOTE_USER="root"
REMOTE_HOST="139.180.201.180"
REMOTE_APP_DIR="/root/trade_compass_be"
SSH_KEY="~/.ssh/id_rsa"
SSH_OPTS="-i $SSH_KEY"
PM2_APP_NAME="trade-compass-be"
# Ensure pm2 commands run correctly even if the app isn't initially running
PM2_START_CMD="pm2 start ./dist/app/server.js --name $PM2_APP_NAME --time -f"
PM2_RESTART_CMD="pm2 restart $PM2_APP_NAME --time -f || $PM2_START_CMD"

echo "Starting development deployment (full rsync)..."

# 1. Sync project folder using rsync, excluding specified files/dirs
echo "Syncing project folder to $REMOTE_HOST..."
rsync -avz --delete --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' --exclude 'package-lock.json' --exclude '*.md' --exclude '.git' --exclude 'data' --exclude 'prisma/migrations' -e "ssh $SSH_OPTS" ./ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR/"

# 2. Install dependencies, build, run Prisma, and restart PM2 on remote server
echo "Running setup on $REMOTE_HOST..."
ssh $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_APP_DIR && \
    echo 'Installing dependencies...' && \
    npm install && \
    echo 'Building project...' && \
    npx prisma generate && \
    npx prisma migrate deploy && \
    npm run build && \
    echo 'Running Prisma setup...' && \
    echo 'Restarting application $PM2_APP_NAME...' && \
    $PM2_RESTART_CMD"

echo "Development deployment finished successfully."

exit 0 