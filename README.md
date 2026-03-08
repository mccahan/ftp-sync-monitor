# FTP Sync Monitor

A Node.js application that automatically synchronizes files from a remote FTP or SFTP server to a local directory, with a web-based dashboard for monitoring progress.

## Features

- **Dual Protocol Support** - Works with both FTP and SFTP servers
- **Automatic Synchronization** - Configurable sync interval (default: 5 minutes)
- **Resume Downloads** - Interrupted downloads automatically resume from where they left off
- **Web Dashboard** - Real-time monitoring of sync status, active downloads, and history
- **Progress Tracking** - Live progress bars and download speeds
- **File Status Tracking** - Tracks files across local and remote, with indicators for removed files
- **Auto Cleanup** - Automatically removes old entries for files deleted from both local and remote

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ftp-sync-monitor.git
cd ftp-sync-monitor

# Install dependencies
npm install

# Create configuration
cp config.json.example config.json
# Edit config.json with your server details
```

## Configuration

Configuration can be set via `config.json` or environment variables. Environment variables take precedence.

| Config Key | Environment Variable | Default | Description |
|------------|---------------------|---------|-------------|
| `protocol` | `PROTOCOL` | `ftp` | Protocol to use (`ftp` or `sftp`) |
| `host` | `HOST` | `example.com` | Server hostname |
| `port` | `PORT` | `21` | Server port |
| `user` | `USERNAME` | - | Login username |
| `password` | `PASSWORD` | - | Login password |
| `remoteDir` | `REMOTE_DIR` | `/remote/dir` | Remote directory to sync |
| `localDir` | `LOCAL_DIR` | `./localSync` | Local destination directory |
| `frequency` | `FREQUENCY` | `300` | Sync interval in seconds |
| `prefix` | `PREFIX` | `` | URL prefix for web UI |
| `uiIgnoreSmallFiles` | `UI_IGNORE_SMALL_FILES` | `false` | Hide files under 10MB from the "Recently Finished" UI list (files are still downloaded) |

### Example config.json

```json
{
  "protocol": "sftp",
  "host": "ftp.example.com",
  "port": 22,
  "user": "myuser",
  "password": "mypassword",
  "remoteDir": "/files",
  "localDir": "./downloads",
  "frequency": 600
}
```

## Usage

### Development

```bash
npm run dev
```

Runs with nodemon for auto-reload on code changes.

### Production

```bash
npm start
```

The web dashboard will be available at `http://localhost:3000`.

## Docker

### Build

```bash
docker build -t ftp-sync-monitor .
```

### Run

```bash
docker run -d \
  -p 3000:3000 \
  -e PROTOCOL=sftp \
  -e HOST=ftp.example.com \
  -e PORT=22 \
  -e USERNAME=myuser \
  -e PASSWORD=mypassword \
  -e REMOTE_DIR=/files \
  -e FREQUENCY=300 \
  -v /path/to/downloads:/app/localSync \
  ftp-sync-monitor
```

### Docker Compose

```yaml
version: '3'
services:
  ftp-sync:
    image: mccahan/ftp-sync-monitor:latest
    ports:
      - "3000:3000"
    environment:
      - PROTOCOL=sftp
      - HOST=ftp.example.com
      - PORT=22
      - USERNAME=myuser
      - PASSWORD=mypassword
      - REMOTE_DIR=/files
      - FREQUENCY=300
    volumes:
      - ./downloads:/app/localSync
      - ./fileStatus.json:/app/fileStatus.json
```

## Web Dashboard

The dashboard displays:

- **Sync Status** - Current state (Idle/Syncing) with manual sync trigger
- **Last/Next Sync** - Timestamp of last sync and countdown to next
- **Downloads** - Active downloads with progress bars and pending files
- **Recently Finished** - Completed downloads from the last 3 days with status indicators

### File Status Indicators

| Status | Description |
|--------|-------------|
| Synced | File exists on both local and remote |
| Local removed | File was deleted from local storage |
| Remote removed | File no longer exists on remote server |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/widget.html` | GET | Compact widget for embedding |
| `/files` | GET | File status list (JSON) |
| `/events` | GET | Event log (JSON) |
| `/sync-status` | GET | Current sync status, timing info |
| `/start-sync` | POST | Trigger manual sync |

## Homepage Widget

A compact status widget is available for embedding in [Homepage](https://gethomepage.dev/) or other dashboards.

### Docker Compose with Homepage Labels

```yaml
version: '3'
services:
  ftp-sync:
    image: mccahan/ftp-sync-monitor:latest
    container_name: ftp-sync-monitor
    ports:
      - "3000:3000"
    environment:
      - PROTOCOL=sftp
      - HOST=ftp.example.com
      - PORT=22
      - USERNAME=myuser
      - PASSWORD=mypassword
      - REMOTE_DIR=/files
      - FREQUENCY=300
    volumes:
      - ./downloads:/app/localSync
      - ./fileStatus.json:/app/fileStatus.json
    labels:
      - homepage.group=Downloads
      - homepage.name=FTP Sync
      - homepage.icon=mdi-sync
      - homepage.href=http://ftp-sync-monitor:3000/
      - homepage.description=File synchronization
      - homepage.widget.type=iframe
      - homepage.widget.src=http://ftp-sync-monitor:3000/widget.html
      - homepage.widget.classes=h-28
```

### Manual services.yaml Configuration

```yaml
- FTP Sync:
    icon: mdi-sync
    href: http://your-server:3000/
    widget:
      type: iframe
      name: FTP Sync Status
      src: http://your-server:3000/widget.html
      classes: h-28
```

### Widget Features

- Sync status indicator (Idle/Syncing)
- Countdown to next sync
- Active, pending, and synced file counts
- Current download progress bar (when downloading)
- Transparent background (adapts to Homepage theme)

## Data Files

| File | Description |
|------|-------------|
| `fileStatus.json` | Persistent file tracking state |
| `events.log` | Append-only event log |
| `config.json` | Local configuration (optional) |

## License

MIT
