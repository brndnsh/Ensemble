#!/bin/bash

# Deployment script for TEST environment with Bundling and Cache Busting
# Target: ensembletest:/var/www/html/

set -e

echo "🚀 Starting deployment to TEST (Bundled)..."

# 1. Get version/hash
REV=$(git rev-parse --short HEAD)
echo "🚀 Deployment version: $REV"

# 2. Clean and create dist folder
rm -rf dist
mkdir -p dist

# 3. Bundle and Minify JavaScript
echo "📦 Bundling JavaScript..."
./node_modules/.bin/esbuild public/logic-worker.js --bundle --minify --outfile=dist/logic-worker.$REV.js --format=esm
./node_modules/.bin/esbuild public/main.js --bundle --minify --outfile=dist/main.$REV.js --format=esm --define:WORKER_PATH="'logic-worker.$REV.js'"

# 4. Bundle and Minify CSS
echo "🎨 Bundling CSS..."
./node_modules/.bin/esbuild public/styles.css --bundle --minify --outfile=dist/styles.$REV.css

# 5. Copy other assets
echo "📄 Copying static assets..."
cp public/index.html dist/index.html
cp public/manual.html dist/manual.html
cp public/manifest.json dist/manifest.json
cp public/icon.svg dist/icon.svg
cp public/icon-192.png dist/icon-192.png
cp public/icon-512.png dist/icon-512.png
cp public/sw.js dist/sw.js

# 6. Update index.html and manual.html with hashed filenames
echo "🔧 Updating index.html and manual.html..."
sed -i "s/styles.css/styles.$REV.css/" dist/index.html
sed -i "s/main.js/main.$REV.js/" dist/index.html
sed -i "s/styles.css/styles.$REV.css/" dist/manual.html

# 7. Update sw.js with hashed assets and cache name using placeholders
echo "🔧 Updating Service Worker..."
sed -i "s#/\* CACHE_NAME_PLACEHOLDER \*/#ensemble-test-$REV#" dist/sw.js

ASSETS_LIST="'./', './index.html', './manual.html', './main.$REV.js', './logic-worker.$REV.js', './styles.$REV.css', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'"
sed -i "s#/\* ASSETS_PLACEHOLDER \*/#$ASSETS_LIST#" dist/sw.js

# 8. Deploy to TEST server
echo "🚚 Uploading to ensembletest..."
scp -r dist/* root@ensembletest:/var/www/html/

# 9. Cleanup
echo "🧹 Cleaning up..."
rm -rf dist

echo "✅ Deployment to TEST complete!"