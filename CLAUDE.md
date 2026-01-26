# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FTP Sync Monitor is a Node.js application that synchronizes files from a remote FTP or SFTP server to a local directory. It provides automatic periodic synchronization, download resume capability, and a web-based admin dashboard.

## Commands

```bash
# Development (auto-reload with nodemon)
npm run dev

# Production
npm start

# Docker build
docker build -t ftp-sync-monitor .

# Docker run (example)
docker run -e HOST=ftp.example.com -e USERNAME=user -e PASSWORD=pass -p 3000:3000 ftp-sync-monitor
```

## Architecture

The application is a single-file Node.js server (`index.js`) using ES modules with three main components:

### Connection Layer
- `connectFTP()` - FTP connections via `basic-ftp`
- `connectSFTP()` - SFTP connections via `ssh2-sftp-client`
- Protocol selected via `config.protocol` ('ftp' or 'sftp')

### Sync Engine
- `syncFiles()` - Main orchestration, runs on startup then every `config.schedule` seconds
- `traverseDir()` - Recursive remote directory traversal
- `processFile()` - Downloads individual files with resume support (uses `.tmp` extension during download)

### Web Server (Express on port 3000)
- `GET /` - Admin dashboard (`public/admin.html`)
- `GET /files` - File status JSON (filtered to last 3 days)
- `GET /events` - Event log
- `GET /sync-status` - Returns `{status: 'running'|'idle'}`
- `POST /start-sync` - Trigger manual sync

### State Files
- `fileStatus.json` - Persisted download state (status, size, progress, speed)
- `events.log` - Append-only event log
- `config.json` - Local configuration (optional, env vars take precedence)

## Configuration

Environment variables override `config.json`. Key settings:
- `PROTOCOL` - 'ftp' or 'sftp'
- `HOST`, `PORT`, `USERNAME`, `PASSWORD` - Server credentials
- `REMOTE_DIR` - Remote path to sync from
- `LOCAL_DIR` - Local destination (default: `./localSync`)
- `FREQUENCY` - Sync interval in seconds (default: 300)
- `PREFIX` - URL prefix for web UI routes

## Key Behaviors

- Files are downloaded to `.tmp` then renamed on completion (enables resume)
- File status tracks: Pending → Downloading → Synced
- Already-synced files are skipped based on filename and size match
- Sync scheduling uses recursive `setTimeout` (not cron)
- Dashboard auto-refreshes every 5 seconds
