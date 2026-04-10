const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const iconv = require('iconv-lite');

let mainWindow;
let trayMap = new Map();
let refreshInterval;
let isQuitting = false;

const APP_NAME = 'WSLNexus';
const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

// --- Tray Icon Generation ---
// 32x32 "N" letter inside a rounded-square, colored by state

function createTrayIcon(bgR, bgG, bgB) {
    const size = 32;
    const buf = Buffer.alloc(size * size * 4);
    const cornerRadius = 6;

    // Rounded rectangle check
    function inRoundedRect(x, y, w, h, r) {
        if (x >= r && x <= w - r) return y >= 0 && y < h;
        if (y >= r && y <= h - r) return x >= 0 && x < w;
        // Corners
        let cx, cy;
        if (x < r && y < r) { cx = r; cy = r; }
        else if (x > w - r && y < r) { cx = w - r; cy = r; }
        else if (x < r && y > h - r) { cx = r; cy = h - r; }
        else if (x > w - r && y > h - r) { cx = w - r; cy = h - r; }
        else return false;
        return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r;
    }

    // "N" glyph definition in a ~20x20 area centered in 32x32
    // Using thick strokes for clarity at small size
    function isNLetter(px, py) {
        const ox = 7, oy = 7; // offset into 32x32
        const x = px - ox, y = py - oy;
        const w = 18, h = 18;
        const stroke = 4;
        if (x < 0 || x >= w || y < 0 || y >= h) return false;

        // Left vertical bar
        if (x < stroke) return true;
        // Right vertical bar
        if (x >= w - stroke) return true;
        // Diagonal from top-left to bottom-right
        const diagPos = (y / h) * (w - stroke);
        if (x >= diagPos && x < diagPos + stroke + 1) return true;

        return false;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;

            if (inRoundedRect(x, y, size, size, cornerRadius)) {
                if (isNLetter(x, y)) {
                    // White letter
                    buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
                } else {
                    // Colored background
                    buf[i] = bgR; buf[i + 1] = bgG; buf[i + 2] = bgB; buf[i + 3] = 255;
                }
            } else {
                buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
            }
        }
    }

    return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

const ICON_RUNNING = createTrayIcon(16, 185, 129);    // Green background
const ICON_STOPPED = createTrayIcon(120, 120, 130);    // Gray background

function getIconForStatus(status) {
    return status === 'Running' ? ICON_RUNNING : ICON_STOPPED;
}

// --- Window ---

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#ffffff',
            height: 30
        },
        backgroundColor: '#050505',
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.loadFile('index.html');

    // Minimize to tray on close instead of quitting
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function showWindow() {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    } else {
        createWindow();
    }
}

// --- Registry auto-launch ---

function getAutoLaunchFromRegistry() {
    return new Promise((resolve) => {
        exec(`reg query "${REG_KEY}" /v "${APP_NAME}" 2>nul`, { encoding: 'buffer' }, (error, stdout) => {
            if (error) {
                resolve(false);
                return;
            }
            const decoded = iconv.decode(stdout, 'cp850');
            resolve(decoded.includes(APP_NAME));
        });
    });
}

function setAutoLaunchInRegistry(enable) {
    const exePath = app.getPath('exe');
    return new Promise((resolve) => {
        if (enable) {
            exec(`reg add "${REG_KEY}" /v "${APP_NAME}" /t REG_SZ /d "\\"${exePath}\\"" /f`, (err) => {
                if (err) console.error('Failed to set auto-launch:', err.message);
                resolve(!err);
            });
        } else {
            exec(`reg delete "${REG_KEY}" /v "${APP_NAME}" /f`, (err) => {
                if (err) console.error('Failed to remove auto-launch:', err.message);
                resolve(!err);
            });
        }
    });
}

// --- WSL Management ---

function execPromise(cmd, timeout = 10000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { encoding: 'buffer', timeout }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

async function getDistros() {
    try {
        const stdout = await execPromise('wsl --list --verbose');

        let decoded = iconv.decode(stdout, 'utf16le');

        if (decoded.includes('\u0000')) {
            decoded = iconv.decode(stdout, 'win1252');
        }

        const lines = decoded.split(/[\r\n]+/);
        const distros = [];

        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            let isDefault = false;
            if (line.startsWith('*')) {
                isDefault = true;
                line = line.substring(1).trim();
            }

            const parts = line.split(/\s{2,}/);
            if (parts.length >= 2) {
                distros.push({
                    name: parts[0],
                    state: parts[1],
                    version: parts[2] || '?',
                    isDefault
                });
            }
        }
        return distros;
    } catch (err) {
        console.error('Failed to get distros:', err.message);
        return [];
    }
}

function startDistro(name) {
    const child = spawn('wsl', ['-d', name, '--', 'sh', '-c', 'nohup sleep 2147483647 >/dev/null 2>&1 &'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
}

function stopDistro(name) {
    return new Promise((resolve) => {
        exec(`wsl --terminate "${name}"`, (err) => {
            if (err) console.error(`Failed to stop ${name}:`, err.message);
            resolve();
        });
    });
}

function toggleDistro(name, currentState) {
    if (currentState === 'Stopped') {
        startDistro(name);
    } else {
        stopDistro(name);
    }
}

function openTerminal(name) {
    exec(`wt wsl -d "${name}"`, (err) => {
        if (err) {
            exec(`start cmd.exe /c wsl -d "${name}"`, (err2) => {
                if (err2) console.error(`Failed to open terminal for ${name}:`, err2.message);
            });
        }
    });
}

// --- System Tray Logic ---

function updateTray(distros) {
    const currentNames = new Set(distros.map(d => d.name));

    for (const [name, tray] of trayMap) {
        if (!currentNames.has(name)) {
            tray.destroy();
            trayMap.delete(name);
        }
    }

    distros.forEach(distro => {
        let tray = trayMap.get(distro.name);
        const icon = getIconForStatus(distro.state);
        const contextMenu = Menu.buildFromTemplate([
            { label: `${distro.name} (${distro.state})`, enabled: false },
            { type: 'separator' },
            {
                label: distro.state === 'Stopped' ? 'Start' : 'Stop',
                click: () => {
                    toggleDistro(distro.name, distro.state);
                    setTimeout(refreshData, 1500);
                }
            },
            {
                label: 'Open Terminal',
                click: () => openTerminal(distro.name)
            },
            { type: 'separator' },
            {
                label: 'Show Window',
                click: () => showWindow()
            },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);

        if (!tray) {
            tray = new Tray(icon);
            tray.setToolTip(`WSL Nexus: ${distro.name} (${distro.state})`);
            trayMap.set(distro.name, tray);

            tray.on('click', () => showWindow());
        } else {
            tray.setImage(icon);
            tray.setToolTip(`WSL Nexus: ${distro.name} (${distro.state})`);
        }

        tray.setContextMenu(contextMenu);
    });
}

async function refreshData() {
    const distros = await getDistros();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-distros', distros);
    }
    updateTray(distros);
}

// --- App Lifecycle ---

app.whenReady().then(() => {
    createWindow();
    refreshData();
    refreshInterval = setInterval(refreshData, 3000);

    ipcMain.handle('get-distros', () => getDistros());
    ipcMain.handle('get-auto-launch', () => getAutoLaunchFromRegistry());

    ipcMain.on('toggle-distro', (_event, name, state) => {
        toggleDistro(name, state);
        setTimeout(refreshData, 800);
        setTimeout(refreshData, 2000);
        setTimeout(refreshData, 4000);
    });

    ipcMain.on('open-terminal', (_event, name) => {
        openTerminal(name);
    });

    ipcMain.on('set-auto-launch', (_event, enable) => {
        setAutoLaunchInRegistry(enable);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Don't quit when all windows are closed — stay in tray
app.on('window-all-closed', () => {
    // Do nothing — app stays alive in tray
});

app.on('before-quit', () => {
    isQuitting = true;
    if (refreshInterval) clearInterval(refreshInterval);
    for (const [, tray] of trayMap) {
        tray.destroy();
    }
    trayMap.clear();
});
