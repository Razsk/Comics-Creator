$ErrorActionPreference = "Stop"

$SERVER = "razsk@65.108.93.59"
$REMOTE_DIR = "comics-creator"
$ARCHIVE = "deploy-comics-creator.tar.gz"

Write-Host "==> 1. Packaging Comics Creator source code..." -ForegroundColor Cyan
if (Test-Path $ARCHIVE) { Remove-Item $ARCHIVE -Force }

tar -czf $ARCHIVE `
    --exclude="node_modules" `
    --exclude=".next" `
    --exclude=".git" `
    --exclude=".agents" `
    --exclude="deploy-comics-creator.tar.gz" `
    .

Write-Host "==> 2. Ensuring remote directory exists (~/$REMOTE_DIR)..." -ForegroundColor Cyan
ssh -n -o BatchMode=yes -o StrictHostKeyChecking=no $SERVER "mkdir -p ~/$REMOTE_DIR"

Write-Host "==> 3. Uploading archive to $SERVER..." -ForegroundColor Cyan
scp -o BatchMode=yes -o StrictHostKeyChecking=no $ARCHIVE "${SERVER}:${REMOTE_DIR}/$ARCHIVE"

Write-Host "==> 4. Extracting & building Docker container on $SERVER..." -ForegroundColor Cyan
$remoteScript = "cd ~/$REMOTE_DIR && tar -xzf $ARCHIVE && rm -f $ARCHIVE && docker compose -f docker-compose.prod.yml up -d --build && sleep 3 && docker ps --filter name=comics-creator-web && curl -s -I http://localhost:8484 | head -n 5"
ssh -n -o BatchMode=yes -o StrictHostKeyChecking=no $SERVER $remoteScript

Write-Host "==> 5. Cleaning up local archive..." -ForegroundColor Cyan
if (Test-Path $ARCHIVE) { Remove-Item $ARCHIVE -Force }

Write-Host "==> Deployment Complete! Comics Creator is live on port 8484 (http://comics.savant.dk / http://65.108.93.59:8484)" -ForegroundColor Green
