# Build the Linux packages on Ubuntu 24.04 (glibc 2.39 — the same base as
# Linux Mint 22). Building on the host would link against its newer glibc and
# produce an AppImage that cannot run on Mint.
FROM node:22-bookworm

# electron-builder needs these to produce .deb and AppImage:
#  - fakeroot/dpkg to satisfy the deb tooling
#  - xz-utils for AppRun/squashfs compression
#  - libarchive/libfuse for AppImage assembly
RUN apt-get update && apt-get install -y --no-install-recommends \
      fakeroot \
      dpkg-dev \
      xz-utils \
      libarchive-tools \
      libfuse2 \
      squashfs-tools \
      file \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Manifest first so the dependency layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.app.json vite.config.ts index.html electron.cjs ./
COPY scripts/ ./scripts/
COPY src/ ./src/

# Native modules ship prebuilt N-API binaries (better-sqlite3, argon2), so the
# ignore-scripts install above is enough and no node-gyp run is needed.
RUN npm run build

# Targets are declared in package.json "build.linux.target"; listing them as
# CLI args overrides that list. npmRebuild is disabled so the prebuilt native
# binaries are copied verbatim instead of recompiled.
RUN npx electron-builder --linux --publish never --config.npmRebuild=false