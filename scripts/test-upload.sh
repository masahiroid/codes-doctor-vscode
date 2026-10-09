#!/bin/bash

# Test upload endpoint
# Usage: ./scripts/test-upload.sh <path-to-zip-file>

if [ -z "$1" ]; then
    echo "❌ Usage: ./scripts/test-upload.sh <path-to-zip-file>"
    exit 1
fi

echo "📤 Testing upload to http://localhost:3000/api/upload"
echo "   File: $1"

curl -X POST http://localhost:3000/api/upload \
  -F "file=@$1" \
  -H "Accept: application/json"

echo ""
