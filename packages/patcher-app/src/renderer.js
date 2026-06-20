document.addEventListener('DOMContentLoaded', () => {
  const patchBtn = document.getElementById('patch-btn');
  const minimizeBtn = document.getElementById('minimize-btn');
  const closeBtn = document.getElementById('close-btn');
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress-bar');
  const btnText = patchBtn.querySelector('.btn-text');
  const unpatchBtn = document.getElementById('unpatch-btn');
  const unpatchBtnText = unpatchBtn.querySelector('.btn-text');

  minimizeBtn.addEventListener('click', () => {
    window.electronAPI.minimizeApp();
  });

  closeBtn.addEventListener('click', () => {
    window.electronAPI.closeApp();
  });

  patchBtn.addEventListener('click', async () => {
    patchBtn.disabled = true;
    unpatchBtn.disabled = true;
    btnText.textContent = 'Installing...';
    statusContainer.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressBar.style.background = 'linear-gradient(90deg, var(--primary), #d946ef)';

    const result = await window.electronAPI.startPatch();

    if (result.success) {
      btnText.textContent = 'Installed';
      patchBtn.style.borderColor = 'var(--success)';
      patchBtn.style.boxShadow = '0 10px 20px -10px var(--success)';
      progressBar.style.background = 'var(--success)';
      
      setTimeout(() => {
        btnText.textContent = 'Exit';
        patchBtn.disabled = false;
        patchBtn.onclick = () => window.electronAPI.closeApp();
      }, 2000);
    } else {
      btnText.textContent = 'Failed';
      patchBtn.style.borderColor = 'var(--error)';
      progressBar.style.background = 'var(--error)';
      patchBtn.disabled = false;
      
      setTimeout(() => {
        btnText.textContent = 'Retry Install';
        patchBtn.disabled = false;
        unpatchBtn.disabled = false;
      }, 3000);
    }
  });

  unpatchBtn.addEventListener('click', async () => {
    patchBtn.disabled = true;
    unpatchBtn.disabled = true;
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
        patchBtn.disabled = false;
        unpatchBtn.disabled = false;
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
