#!/bin/bash
# CSAP Distribution Package Installer

set -e  # Exit on error

echo "================================"
echo "CSAP v1.3 Quick Installer"
echo "================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "   Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed."
    echo "   Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
echo "✓ Docker Compose $(docker-compose --version | grep -oP '\d+\.\d+\.\d+')"
echo ""

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "   Created: .env"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env with your settings:"
    echo "   - OPENAI_API_KEY (if LLM enabled)"
    echo "   - PORT (if needed)"
    echo ""
    echo "   nano .env"
    echo ""
fi

# Build image
echo "🔨 Building Docker image..."
docker-compose -f docker-compose-prod.yml build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env if needed:"
echo "   nano .env"
echo ""
echo "2. Start the service:"
echo "   docker-compose -f docker-compose-prod.yml up -d"
echo ""
echo "3. Access CSAP:"
echo "   http://localhost:3000"
echo ""
echo "For help, see: docs/DOCKER_SETUP.md"
