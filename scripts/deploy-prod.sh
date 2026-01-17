#!/bin/bash

# Deployment script for PROD environment
# Target: ensemble:/var/www/html/

set -e

echo "🌟 Starting deployment to PROD..."

# 1. Clean and create dist folder
rm -rf dist
mkdir -p dist

# 2. Minify JS files using esbuild
echo "📦 Minifying JavaScript..."
./node_modules/.bin/esbuild public/*.js --minify --outdir=dist --format=esm

# 3. Copy other assets (HTML, CSS, JSON, images, etc.)
echo "📄 Copying assets..."
rsync -av --exclude='*.js' public/ dist/

# 4. Deploy to PROD server
echo "🚚 Uploading to ensemble..."
scp -r dist/* ensemble:/var/www/html/

# 5. Cleanup
echo "🧹 Cleaning up..."
rm -rf dist

echo "✅ Deployment to PROD complete!"
