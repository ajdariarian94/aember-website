#!/bin/bash
# Host setup for the aember-website dev container: checks the tools and
# writes DOCKER_GID to tools/scripts/.env (git-ignored).
set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Aember Website Development Environment Setup        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "🔍 Checking required tools..."
MISSING_TOOLS=()
command -v docker &>/dev/null || MISSING_TOOLS+=("docker")
command -v git &>/dev/null || MISSING_TOOLS+=("git")

if ! command -v code &>/dev/null; then
    echo "  ⚠️  VS Code (code) not found in PATH — make sure it's installed"
else
    echo "  ✅ VS Code found"
    if code --list-extensions 2>/dev/null | grep -q "ms-vscode-remote.remote-containers"; then
        echo "  ✅ Dev Containers extension installed"
    else
        echo "  ⚠️  Dev Containers extension not found — installing..."
        code --install-extension ms-vscode-remote.remote-containers
    fi
fi

if [ ${#MISSING_TOOLS[@]} -ne 0 ]; then
    echo "  ❌ Missing required tools: ${MISSING_TOOLS[*]}"
    exit 1
fi
echo "  ✅ Docker found ($(docker --version | cut -d' ' -f3 | tr -d ','))"
echo "  ✅ Git found ($(git --version | cut -d' ' -f3))"
echo ""

echo "🐋 Configuring Docker group access..."
ENV_FILE="$(dirname "$0")/.env"
if getent group docker >/dev/null 2>&1; then
    DOCKER_GID=$(getent group docker | cut -d: -f3)
    [ -f "$ENV_FILE" ] || echo "# aember-website environment — never commit this file" > "$ENV_FILE"
    if grep -q "^export DOCKER_GID=" "$ENV_FILE"; then
        sed -i "s/^export DOCKER_GID=.*/export DOCKER_GID=${DOCKER_GID}/" "$ENV_FILE"
    else
        echo "export DOCKER_GID=${DOCKER_GID}" >> "$ENV_FILE"
    fi
    echo "  ✅ DOCKER_GID=${DOCKER_GID} in tools/scripts/.env"
else
    echo "  ⚠️  docker group not found — is Docker installed and running?"
fi
echo ""
echo "  Next steps:"
echo "  1. Open VS Code in this directory: code ."
echo "  2. Click 'Reopen in Container' when prompted"
echo "  3. In the container: aember test, aember dev"
echo ""
