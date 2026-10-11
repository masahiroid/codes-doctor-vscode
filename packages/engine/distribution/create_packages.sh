#!/bin/bash
# Create distribution packages in multiple formats

set -e

PACKAGE_DIR="csap-v1.3"
VERSION="1.3.0"
BUILD_DATE=$(date +%Y%m%d)

echo "================================"
echo "CSAP Distribution Packager"
echo "================================"
echo ""

if [ ! -d "$PACKAGE_DIR" ]; then
    echo "❌ Error: $PACKAGE_DIR directory not found"
    exit 1
fi

echo "📦 Creating distribution packages..."
echo ""

# TAR.GZ format (for Linux/macOS)
TARBALL="csap-v${VERSION}-${BUILD_DATE}.tar.gz"
echo "  Creating: $TARBALL"
tar -czf "$TARBALL" "$PACKAGE_DIR"
TARBALL_SIZE=$(du -h "$TARBALL" | cut -f1)
echo "    ✓ Size: $TARBALL_SIZE"
echo ""

# ZIP format (for Windows)
ZIPFILE="csap-v${VERSION}-${BUILD_DATE}.zip"
echo "  Creating: $ZIPFILE"
zip -r -q "$ZIPFILE" "$PACKAGE_DIR"
ZIPFILE_SIZE=$(du -h "$ZIPFILE" | cut -f1)
echo "    ✓ Size: $ZIPFILE_SIZE"
echo ""

# Create checksums
echo "  Creating checksums..."
sha256sum "$TARBALL" > "$TARBALL.sha256"
sha256sum "$ZIPFILE" > "$ZIPFILE.sha256"
echo "    ✓ Checksums created"
echo ""

# Summary
echo "✅ Packaging complete!"
echo ""
echo "Files created:"
echo "  - $TARBALL ($TARBALL_SIZE)"
echo "  - $ZIPFILE ($ZIPFILE_SIZE)"
echo "  - $TARBALL.sha256"
echo "  - $ZIPFILE.sha256"
echo ""
echo "Distribution ready for:"
echo "  - Linux/macOS users: $TARBALL"
echo "  - Windows users: $ZIPFILE"
echo ""
echo "To distribute:"
echo "  1. Upload to your repository / hosting"
echo "  2. Include checksums for verification"
echo "  3. Include installation instructions"
echo ""
