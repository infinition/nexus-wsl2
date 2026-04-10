const grid = document.getElementById('distro-grid');
const autoLaunchToggle = document.getElementById('auto-launch-toggle');

let currentDistros = [];

async function init() {
    // Load auto-launch state from registry
    const autoLaunch = await window.electronAPI.getAutoLaunch();
    autoLaunchToggle.checked = autoLaunch;

    // Load distros
    currentDistros = await window.electronAPI.getDistros();
    renderDistros(currentDistros);
    lucide.createIcons();
}

window.electronAPI.onUpdateDistros((distros) => {
    currentDistros = distros;
    renderDistros(currentDistros);
    lucide.createIcons();
});

autoLaunchToggle.addEventListener('change', (e) => {
    window.electronAPI.setAutoLaunch(e.target.checked);
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderDistros(distros) {
    grid.innerHTML = '';

    if (distros.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-secondary); text-align:center; grid-column: 1/-1;">No WSL distributions found.</p>';
        return;
    }

    distros.forEach(distro => {
        const card = document.createElement('div');
        card.className = 'card';

        const isRunning = distro.state === 'Running';
        const statusClass = isRunning ? 'status-running' : 'status-stopped';
        const toggleIcon = isRunning ? 'square' : 'play';
        const toggleText = isRunning ? 'Stop' : 'Start';
        const safeName = escapeHtml(distro.name);
        const safeState = escapeHtml(distro.state);
        const safeVersion = escapeHtml(distro.version);

        card.innerHTML = `
            <div class="card-header">
                <div class="distro-name">${safeName} ${distro.isDefault ? '<span style="font-size:0.8em; opacity:0.5">&#9733;</span>' : ''}</div>
                <div class="status-badge ${statusClass}">
                    <div class="status-dot"></div>
                    ${safeState}
                </div>
            </div>
            <div class="distro-info">
                Version: WSL ${safeVersion}
            </div>
            <div class="actions">
                <button class="btn-primary" data-action="toggle" data-name="${safeName}">
                    <i data-lucide="${toggleIcon}"></i> ${toggleText}
                </button>
                <button class="btn-terminal" data-action="terminal" data-name="${safeName}">
                    <i data-lucide="terminal"></i> Terminal
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    grid.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            const distro = currentDistros.find(d => d.name === name);
            if (distro) {
                window.electronAPI.toggleDistro(name, distro.state);
                btn.disabled = true;
                btn.textContent = distro.state === 'Running' ? 'Stopping...' : 'Starting...';
            }
        });
    });

    grid.querySelectorAll('button[data-action="terminal"]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.electronAPI.openTerminal(btn.dataset.name);
        });
    });
}

init();
