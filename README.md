# WSL Nexus

Lightweight system tray application for managing WSL distributions on Windows.

<img width="1092" height="647" alt="image" src="https://github.com/user-attachments/assets/7c52d4df-1d7f-4447-bc7b-23a49d4dfd88" />


![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Overview

WSL Nexus provides a minimal, always-available interface for controlling WSL distributions. It lives in the system tray with per-distribution status icons and offers a glassmorphism dashboard for quick management.

## Features

- **Real-time monitoring** of all WSL distributions (Running / Stopped)
- **One-click Start / Stop** from the dashboard or system tray context menu
- **Terminal launcher** with Windows Terminal support (CMD fallback)
- **Per-distribution tray icons** with color-coded status (green = running, gray = stopped)
- **Minimize to tray** on window close - stays resident for background monitoring
- **Start with Windows** via registry integration (`HKCU\...\Run`)
- **Glassmorphism UI** with dark theme

## Installation

### Download

Grab the latest release from the [Releases](../../releases) page:

- **WSL Nexus Setup x.x.x.exe** - Installer (NSIS)
- **WSL Nexus x.x.x.exe** - Portable

### Build from source

```bash
git clone https://github.com/infinition/nexus-wsl2.git
cd nexus-wsl2
npm install
npm start        # dev mode
npm run dist     # build .exe
```

## Requirements

- Windows 10 or 11
- WSL enabled with at least one distribution installed

## Architecture

```
main.js        Electron main process - WSL commands, tray management, registry
preload.js     Context bridge (IPC API exposure)
renderer.js    UI logic - card rendering, state management
index.html     Dashboard layout
styles.css     Glassmorphism theme
```

### Key design decisions

- **`iconv-lite`** for decoding `wsl --list --verbose` output (UTF-16LE on most systems)
- **Registry-based auto-launch** (`reg add/query/delete`) instead of `app.setLoginItemSettings` for reliability on Windows
- **Detached `spawn`** with `sleep` to keep distributions alive after start
- **Per-distro tray icons** rather than a single aggregate icon for direct status visibility

## Tech Stack

| Component | Purpose |
|-----------|---------|
| Electron 33 | Desktop runtime |
| Lucide | Icon library |
| iconv-lite | WSL output encoding |
| electron-builder | Packaging (NSIS + portable) |

## License

MIT

## Star History

<a href="https://www.star-history.com/?repos=infinition%2Fnexus-wsl2&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=infinition/nexus-wsl2&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=infinition/nexus-wsl2&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=infinition/nexus-wsl2&type=date&legend=top-left" />
 </picture>
</a>
