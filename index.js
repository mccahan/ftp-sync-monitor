const express = require('express');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const sshClient = require('ssh2-sftp-client');
const app = express();
const PORT = 3000;

// Serve static files for admin UI
app.use(express.static(path.join(__dirname, 'public')));

const fileStatusPath = path.join(__dirname, 'fileStatus.json');

// Load configuration from local file if available
let localConfig = {};
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Configuration
const config = {
    protocol: process.env.PROTOCOL || localConfig.protocol || 'ftp', // 'ftp' or 'sftp'
    host: process.env.HOST || localConfig.host || 'example.com',
    port: process.env.PORT || localConfig.port || 21,
    user: process.env.USERNAME || localConfig.user || 'username',
    password: process.env.PASSWORD || localConfig.password || 'password',
    remoteDir: process.env.REMOTE_DIR || localConfig.remoteDir || '/remote/dir',
    localDir: process.env.LOCAL_DIR || localConfig.localDir || path.join(__dirname, 'localSync'),
    schedule: process.env.FREQUENCY || localConfig.frequency || 300,
};

let fileStatus = {};
// Load fileStatus from disk if it exists
if (fs.existsSync(fileStatusPath)) {
  fileStatus = JSON.parse(fs.readFileSync(fileStatusPath, 'utf-8'));
}

// Save fileStatus to disk
function saveFileStatus() {
  fs.writeFileSync(fileStatusPath, JSON.stringify(fileStatus, null, 2));
}

// Store file info for UI
let recentEvents = [];
const logFile = path.join(__dirname, 'events.log');

// Logging function
function logEvent(event) {
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(event)}\n`;
    recentEvents.push(event);
    fs.appendFileSync(logFile, logEntry);
}

// Ensure local directory exists
if (!fs.existsSync(config.localDir)) {
    fs.mkdirSync(config.localDir, { recursive: true });
}

// FTP Module
async function connectFTP() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: config.host,
            user: config.user,
            password: config.password,
            port: config.port,
        });
        logEvent({ type: 'FTP Connection', status: 'Success' });
        return client;
    } catch (error) {
        console.error('FTP Connection Error:', error);
        logEvent({ type: 'FTP Connection', status: 'Failure', error: error.message });
        return null;
    }
}

// SFTP Module
async function connectSFTP() {
    const client = new sshClient();
    try {
        await client.connect({
            host: config.host,
            port: config.port,
            username: config.user,
            password: config.password,
        });
        logEvent({ type: 'SFTP Connection', status: 'Success' });
        return client;
    } catch (error) {
        console.error('SFTP Connection Error:', error);
        logEvent({ type: 'SFTP Connection', status: 'Failure', error: error.message });
        return null;
    }
}

// File Synchronization
async function syncFiles() {
    console.log('Sync job started at:', new Date().toISOString());
    logEvent({ type: 'Sync Job', status: 'Started' });
    const client = config.protocol === 'ftp' ? await connectFTP() : await connectSFTP();
    if (!client) {
        console.log('Sync job aborted due to connection failure.');
        logEvent({ type: 'Sync Job', status: 'Aborted - Connection Failure' });
        return;
    }

    async function processFile(remotePath, localPath, size) {
        const filename = localPath.replace(config.localDir, '').replace(/^\//, '');

        if (fileStatus[filename] && fileStatus[filename].status === 'Synced' && fileStatus[filename].size === size) {
          console.log("Already downloaded file: ", filename);
          return;
        }
        
        if (fs.existsSync(localPath)) {
            const localStats = fs.statSync(localPath);
            if (localStats.size === size) {
                logEvent({ type: 'File Skipped', status: 'Already Downloaded', file: remotePath });
                fileStatus[filename] = { status: 'Synced', size, directory: filename.replace(path.basename(filename), '') };
                saveFileStatus();
                return;
            }
        }
        logEvent({ type: 'File Downloading', status: 'Started', file: remotePath, size });
      
        fileStatus[filename] = { status: 'Downloading', size, directory: filename.replace(path.basename(filename), '') };
        saveFileStatus();
        const start = Date.now();

        const totalBytes = size;
        let downloadedBytes = 0;

        const stream = config.protocol === 'ftp'
            ? client.downloadTo(localPath, remotePath)
            : client.get(remotePath, fs.createWriteStream(localPath));

        fileStatus[filename].status = `Downloading`;
        console.log("Downloading file: ", remotePath);
        if (config.protocol === 'ftp') {
            client.trackProgress(info => {
                if (info.name === remotePath) {
                    downloadedBytes = info.bytes;
                    const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
                    fileStatus[filename].progress = percent;
                    saveFileStatus();
                }
            });
        } else {
            stream.on('data', chunk => {
                downloadedBytes += chunk.length;
                const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
                fileStatus[filename].progress = percent;
                saveFileStatus();
            });
        }

        await stream;
        const duration = (Date.now() - start) / 1000;
        const speed = (size / duration / 1024).toFixed(2);
        fileStatus[filename] = { status: 'Completed', size, speed: `${speed} KB/s`, directory: filename.replace(path.basename(filename), '') };
        saveFileStatus();
        logEvent({ type: 'File Downloaded', status: 'Completed', file: remotePath, size, speed: `${speed} KB/s` });
    }

    async function traverseDir(remoteDir, localDir) {
        const pwd = await client.pwd();
        await client.cd(remoteDir);
        const list = await client.list();
        logEvent({ type: 'Directory Listing', status: 'Success', directory: remoteDir });
        for (const file of list) {
            const localPath = path.join(localDir, file.name);

            if (file.type === 'd' || file.type === 2) {
              if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
              await traverseDir(file.name, localPath);
            } else {
              console.log("Processing", file.name)
              await processFile(file.name, localPath, file.size);
            }
        }
        await client.cd(pwd);
    }

    await client.cd(config.remoteDir);
    await traverseDir('.', config.localDir);
    if (config.protocol === 'ftp') client.close(); else if (config.protocol === 'ftp') client.close(); else await client.end();
    console.log('Sync job completed at:', new Date().toISOString());
    logEvent({ type: 'Sync Job', status: 'Completed' });

    setTimeout(syncFiles, config.schedule * 1000);
}

// Web UI
app.use(express.static('public'));

app.get('/files', (req, res) => {
    res.json(fileStatus);
});

app.get('/events', (req, res) => {
    res.json(recentEvents);
});

// Admin UI endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Running initial sync...');
    const client = config.protocol === 'ftp' ? await connectFTP() : await connectSFTP();
    if (client) {
        await client.cd(config.remoteDir);
        const list = await client.list();
        list.forEach(file => {
            const remotePath = path.join(config.remoteDir, file.name);
            if (file.type === 'd' || file.type === 2) return;
            //fileStatus[remotePath.replace(config.remoteDir + path.sep, '')] = { status: 'Pending', size: file.size, directory: file.name.replace(config.remoteDir, '') };
        });
        logEvent({ type: 'Initial Directory Listing', status: 'Success', directory: config.remoteDir, files: list.length });
        if (config.protocol === 'ftp') client.close(); else await client.end();
    }
    await syncFiles();
});
