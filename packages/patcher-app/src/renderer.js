document.addEventListener('DOMContentLoaded', () => {
  const patchBtn = document.getElementById('patch-btn');
  const devBtn = document.getElementById('dev-btn');
  const minimizeBtn = document.getElementById('minimize-btn');
  const closeBtn = document.getElementById('close-btn');
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress-bar');
  const btnText = patchBtn.querySelector('.btn-text');
  const devBtnText = devBtn.querySelector('.btn-text');
  const unpatchBtn = document.getElementById('unpatch-btn');
  const unpatchBtnText = unpatchBtn.querySelector('.btn-text');
  const versionInfo = document.getElementById('version-info');

  function setAllDisabled(disabled) {
    patchBtn.disabled = disabled;
    devBtn.disabled = disabled;
    unpatchBtn.disabled = disabled;
  }

  async function refreshStatus() {
    try {
      const status = await window.electronAPI.getStatus();
      const stable = status.channels?.stable || {};
      const dev = status.channels?.dev || {};

      if (!status.installed) {
        const latest = stable.latestVersion ? ` · Stable v${stable.latestVersion}` : '';
        versionInfo.textContent = `Not installed${latest}`;
        btnText.textContent = 'Install Supercord';
        devBtnText.textContent = 'Install Dev';
      } else {
        const ch = status.installedChannel || 'stable';
        const chLabel = ch === 'dev' ? 'Dev' : 'Stable';
        const cur = status.channels?.[ch] || {};
        if (cur.updateAvailable) {
          versionInfo.textContent = `${chLabel}: v${status.localVersion} → v${cur.latestVersion} (update available)`;
        } else {
          versionInfo.textContent = status.localVersion
            ? `Installed · ${chLabel} v${status.localVersion} (up to date)`
            : `Installed · ${chLabel}`;
        }
        btnText.textContent = ch === 'stable' ? 'Reinstall Supercord' : 'Switch to Stable';
        devBtnText.textContent = ch === 'dev' ? 'Reinstall Dev' : 'Switch to Dev';
      }
    } catch (e) {
      versionInfo.textContent = '';
    }
  }

  refreshStatus();

  minimizeBtn.addEventListener('click', () => {
    window.electronAPI.minimizeApp();
  });

  closeBtn.addEventListener('click', () => {
    window.electronAPI.closeApp();
  });

  // Shared install flow for both stable and dev channels.
  async function runInstall(channel, button, textEl, installingLabel) {
    setAllDisabled(true);
    textEl.textContent = installingLabel;
    statusContainer.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressBar.style.background = 'linear-gradient(90deg, var(--primary), #d946ef)';

    const result = await window.electronAPI.startPatch(channel);

    if (result.success) {
      textEl.textContent = 'Installed';
      button.style.borderColor = 'var(--success)';
      button.style.boxShadow = '0 10px 20px -10px var(--success)';
      progressBar.style.background = 'var(--success)';

      setTimeout(() => {
        textEl.textContent = 'Exit';
        button.disabled = false;
        button.onclick = () => window.electronAPI.closeApp();
      }, 2000);
    } else {
      textEl.textContent = 'Failed';
      button.style.borderColor = 'var(--error)';
      progressBar.style.background = 'var(--error)';

      setTimeout(() => {
        textEl.textContent = 'Retry';
        setAllDisabled(false);
      }, 3000);
    }
  }

  patchBtn.addEventListener('click', () => runInstall('stable', patchBtn, btnText, 'Installing...'));
  devBtn.addEventListener('click', () => runInstall('dev', devBtn, devBtnText, 'Installing Dev...'));

  unpatchBtn.addEventListener('click', async () => {
    setAllDisabled(true);
    unpatchBtnText.textContent = 'Uninstalling...';
    statusContainer.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressBar.style.background = 'linear-gradient(90deg, #64748b, #94a3b8)';

    const result = await window.electronAPI.startUnpatch();

    if (result.success) {
      unpatchBtnText.textContent = 'Uninstalled';
      unpatchBtn.style.borderColor = 'var(--success)';
      progressBar.style.background = 'var(--success)';

      setTimeout(() => {
        unpatchBtnText.textContent = 'Exit';
        unpatchBtn.disabled = false;
        unpatchBtn.onclick = () => window.electronAPI.closeApp();
      }, 2000);
    } else {
      unpatchBtnText.textContent = 'Failed';
      unpatchBtn.style.borderColor = 'var(--error)';
      progressBar.style.background = 'var(--error)';

      setTimeout(() => {
        unpatchBtnText.textContent = 'Retry Uninstall';
        setAllDisabled(false);
      }, 3000);
    }
  });

  window.electronAPI.onPatchStatus((data) => {
    statusText.textContent = data.message;
    if (data.step === 1) progressBar.style.width = '30%';
    if (data.step === 2) progressBar.style.width = '60%';
    if (data.step === 3) progressBar.style.width = '85%';
    if (data.step === 4) progressBar.style.width = '100%';
    if (data.step === -1) progressBar.style.width = '100%'; // Error state
  });
});
