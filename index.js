import express from "express";
import path from "path";
import fs from "fs";
import ftp from "basic-ftp";
import sshClient from "ssh2-sftp-client";
const app = express();
const PORT = 3000;
import cliProgress from "cli-progress";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fileStatusPath = path.join(__dirname, "fileStatus.json");

let isSyncing = false;

// Load configuration from local file if available
let localConfig = {};
const configPath = path.join(__dirname, "config.json");
if (fs.existsSync(configPath)) {
  localConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

const PREFIX = process.env.PREFIX || localConfig.prefix || "";

// Configuration
const config = {
  protocol: process.env.PROTOCOL || localConfig.protocol || "ftp", // 'ftp' or 'sftp'
  host: process.env.HOST || localConfig.host || "example.com",
  port: process.env.PORT || localConfig.port || 21,
  user: process.env.USERNAME || localConfig.user || "username",
  password: process.env.PASSWORD || localConfig.password || "password",
  remoteDir: process.env.REMOTE_DIR || localConfig.remoteDir || "/remote/dir",
  localDir:
    process.env.LOCAL_DIR ||
    localConfig.localDir ||
    path.join(__dirname, "localSync"),
  schedule: process.env.FREQUENCY || localConfig.frequency || 300,
};

let fileStatus = {};
// Load fileStatus from disk if it exists
if (fs.existsSync(fileStatusPath)) {
  fileStatus = JSON.parse(fs.readFileSync(fileStatusPath, "utf-8"));
}

// Save fileStatus to disk
function saveFileStatus() {
  fs.writeFileSync(fileStatusPath, JSON.stringify(fileStatus, null, 2));
}

// Store file info for UI
let recentEvents = [];
const logFile = path.join(__dirname, "events.log");

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
    logEvent({ type: "FTP Connection", status: "Success" });
    return client;
  } catch (error) {
    console.error("FTP Connection Error:", error);
    logEvent({
      type: "FTP Connection",
      status: "Failure",
      error: error.message,
    });
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
    logEvent({ type: "SFTP Connection", status: "Success" });
    return client;
  } catch (error) {
    console.error("SFTP Connection Error:", error);
    logEvent({
      type: "SFTP Connection",
      status: "Failure",
      error: error.message,
    });
    return null;
  }
}

// File Synchronization
async function syncFiles() {
  console.log("Sync job started at:", new Date().toISOString());
  isSyncing = true;
  logEvent({ type: "Sync Job", status: "Started" });
  const client =
    config.protocol === "ftp" ? await connectFTP() : await connectSFTP();
  if (!client) {
    console.log("Sync job aborted due to connection failure.");
    logEvent({ type: "Sync Job", status: "Aborted - Connection Failure" });
    isSyncing = false;
    return;
  }

  async function processFile(remotePath, localPath, size) {
    const filename = localPath.replace(config.localDir, "").replace(/^\//, "");

    if (
      fileStatus[filename] &&
      fileStatus[filename].status === "Synced" &&
      fileStatus[filename].size === size
    ) {
      console.log("Already downloaded file: ", filename);
      return;
    }
    let startAt = 0;

    if (fs.existsSync(localPath)) {
      const localStats = fs.statSync(localPath);
      if (localStats.size === size) {
        logEvent({
          type: "File Skipped",
          status: "Already Downloaded",
          file: remotePath,
        });
        fileStatus[filename] = {
          status: "Synced",
          size,
          directory: filename.replace(path.basename(filename), ""),
        };
        saveFileStatus();
        return;
      }
    }

    console.log("Downloading file: ", remotePath);

    // Check for existing file to resume
    if (fs.existsSync(localPath + ".tmp")) {
      const tmpFileStats = fs.statSync(localPath + ".tmp");
      startAt = tmpFileStats.size;
      console.log("Resuming from byte:", startAt);
    }
    logEvent({
      type: "File Downloading",
      status: "Started",
      file: remotePath,
      size,
    });

    fileStatus[filename] = {
      status: "Downloading",
      size,
      directory: filename.replace(path.basename(filename), ""),
    };
    saveFileStatus();
    const start = Date.now();

    const totalBytes = size;
    let downloadedBytes = 0;

    const stream =
      config.protocol === "ftp"
        ? client.downloadTo(localPath + ".tmp", remotePath, startAt)
        : client.get(remotePath, fs.createWriteStream(localPath + ".tmp"));

    fileStatus[filename].status = `Downloading`;

    let progressBar = new cliProgress.SingleBar({
      format: "{filename} |{bar}| {percentage}% || {fileProgress} ({speed})",
    });
    progressBar.start(Math.ceil(totalBytes / 1024 / 1024), startAt, {
      filename: filename.substring(0, 40) + (filename.length > 40 ? "..." : ""),
      speed: "N/A",
      fileProgress: humanFileSize(startAt, totalBytes),
    });

    let lastUpdate = Date.now();
    if (config.protocol === "ftp") {
      client.trackProgress((info) => {
        if (info.name === remotePath) {
          downloadedBytes = info.bytes + startAt;
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
          fileStatus[filename].progress = percent;
          const elapsed = ((Date.now() - start) / 1000).toFixed(2);
          const speed = (info.bytes / elapsed).toFixed(2);
          fileStatus[filename].speed = humanDownloadSpeed(speed);
          progressBar.update(Math.ceil(downloadedBytes / 1024 / 1024), {
            speed: humanDownloadSpeed(speed),
            fileProgress: humanFileSize(downloadedBytes, totalBytes),
          });
          saveFileStatus();

          if (!process.stdout.isTTY && Date.now() - lastUpdate > 10000) {
            console.log(
              `Progress: ${filename.substring(
                0,
                30
              )} - ${percent}% - ${humanFileSize(
                downloadedBytes,
                totalBytes
              )} - ${humanDownloadSpeed(speed)}`
            );
            lastUpdate = Date.now();
          }
        }
      });
    } else {
      stream.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
        fileStatus[filename].progress = percent;
        saveFileStatus();
      });
    }

    await stream;
    const duration = (Date.now() - start) / 1000;
    const speed = (size / duration / 1024).toFixed(2);
    fs.renameSync(localPath + ".tmp", localPath);
    fileStatus[filename] = {
      status: "Synced",
      size,
      speed: `${speed} KB/s`,
      directory: filename.replace(path.basename(filename), ""),
      finishedAt: Math.ceil(new Date().valueOf() / 1000),
    };
    saveFileStatus();
    logEvent({
      type: "File Downloaded",
      status: "Synced",
      file: remotePath,
      size,
      speed: `${speed} KB/s`,
    });
  }

  async function traverseDir(remoteDir, localDir, download = false) {
    const pwd = await client.pwd();
    await client.cd(remoteDir);
    const list = await client.list();
    logEvent({
      type: "Directory Listing",
      status: "Success",
      directory: remoteDir,
    });
    
    // Loop through files and either store their info (if we're just scanning)
    // or download them if we're in download mode
    for (const file of list) {
      const localPath = path.join(localDir, file.name);

      if (file.type === "d" || file.type === 2) {
        if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
        await traverseDir(file.name, localPath, download);
      } else {
        // Check to see whether we already know about this file
        const filename = localPath.replace(config.localDir, "").replace(/^\//, "");
        if (typeof fileStatus[filename] === "undefined") {
          console.log("Found new file:", filename, localPath);
          fileStatus[filename] = {
            status: "Pending",
            size: file.size,
            directory: filename.replace(path.basename(filename), ""),
          };
          saveFileStatus();
        }

        // Download it
        if (download) {
          console.log("Processing", file.name);
          await processFile(file.name, localPath, file.size);
        }
      }
    }
    await client.cd(pwd);
  }

  await client.cd(config.remoteDir);
  await traverseDir(".", config.localDir, true);
  if (config.protocol === "ftp") client.close();
  else if (config.protocol === "ftp") client.close();
  else await client.end();
  console.log("Sync job completed at:", new Date().toISOString());
  isSyncing = false;
  logEvent({ type: "Sync Job", status: "Completed" });

  setTimeout(syncFiles, config.schedule * 1000);
}

// Web UI
app.use(PREFIX, express.static(path.join(__dirname, "public")));

app.get(PREFIX + "/files", (req, res) => {
  const daysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
  const files = Object.fromEntries(
    Object.entries(fileStatus).filter(
      ([, value]) => !value.finishedAt || value.finishedAt >= daysAgo
    )
  );
  res.json(files);
});

app.get(PREFIX + "/events", (req, res) => {
  res.json(recentEvents);
});

// Admin UI endpoint
app.get(PREFIX, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post(PREFIX + "/start-sync", async (_req, res) => {
  if (!isSyncing) {
    syncFiles();
    res.json({ status: "Sync Started" });
  } else {
    res.json({ status: "Sync Already in Progress" });
  }
});

app.get(PREFIX + "/sync-status", (_req, res) => {
  res.json({ status: isSyncing ? 'running' : 'idle' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}${PREFIX}`);
  console.log("Running initial sync...");
  const client =
    config.protocol === "ftp" ? await connectFTP() : await connectSFTP();
  if (client) {
    await client.cd(config.remoteDir);
    const list = await client.list();
    list.forEach((file) => {
      const remotePath = path.join(config.remoteDir, file.name);
      if (file.type === "d" || file.type === 2) return;
      fileStatus[remotePath.replace(config.remoteDir + path.sep, '')] = { status: 'Pending', size: file.size, directory: file.name.replace(config.remoteDir, '') };
    });
    logEvent({
      type: "Initial Directory Listing",
      status: "Success",
      directory: config.remoteDir,
      files: list.length,
    });
    if (config.protocol === "ftp") client.close();
    else await client.end();
  }
  await syncFiles();
});

// Thanks to mpen from https://stackoverflow.com/a/14919494
function humanFileSize(progressBytes, bytes) {
  const thresh = 1024;
  const dp = 2;

  if (Math.abs(bytes) < thresh) {
    return `${progressBytes}/${bytes} B`;
  }

  const units = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    progressBytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return (
    progressBytes.toFixed(dp) +
    " " +
    units[u] +
    " / " +
    bytes.toFixed(dp) +
    " " +
    units[u]
  );
}

function humanDownloadSpeed(bytes) {
  const thresh = 1024;
  const dp = 0;

  if (Math.abs(bytes) < thresh) {
    return `${bytes} Bps`;
  }

  const units = ["kB/s", "MB/s", "GB/s", "TB/s"];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + " " + units[u];
}
