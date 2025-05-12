#!/bin/bash

# Create directories if they don't exist
mkdir -p public/js public/css

# Download XTerm.js and addons
echo "Downloading XTerm.js library..."
curl -L https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js -o public/js/xterm.js
curl -L https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css -o public/css/xterm.css
curl -L https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js -o public/js/xterm-addon-fit.js
curl -L https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js -o public/js/xterm-addon-web-links.js

echo "XTerm.js and addons downloaded successfully!"
