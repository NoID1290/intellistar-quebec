// IntelliSTAR Touchscreen UI Launcher Client
(function() {
  'use strict';

  let currentDuration = 0; // 0 = indefinite/until cleared
  let logAutoScroll = true;
  let logInterval = null;
  let audioContext = null;

  // Sound feedback for touch
  function playTouchSound() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.045);
    } catch (e) {}
  }

  function touchFeedback() {
    if (navigator.vibrate) {
      try { navigator.vibrate(18); } catch (e) {}
    }
    playTouchSound();
  }

  // Toast notifications
  function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast visible' + (isError ? ' error' : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = 'toast';
    }, 3200);
  }

  // API Base URL helper
  function getApiBaseUrl() {
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '7080')) {
      const hostname = window.location.hostname || '127.0.0.1';
      return `http://${hostname}:7080`;
    }
    return '';
  }

  // API Call helper
  async function apiAction(action, payload = {}) {
    touchFeedback();
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/launcher/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Action failed');
      }
      if (data.message) showToast(data.message);
      refreshStatus();
      return data;
    } catch (err) {
      showToast(err.message, true);
      console.error('Action error:', err);
      throw err;
    }
  }

  // Status Polling
  async function refreshStatus() {
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/launcher/status?t=${Date.now()}`);
      if (!res.ok) throw new Error('Status request failed');
      const data = await res.json();
      updateStatusUI(data);
    } catch (e) {
      // If relative fetch failed on non-7080 port or file protocol, try port 7080 explicitly
      try {
        const hostname = window.location.hostname || '127.0.0.1';
        const fallbackRes = await fetch(`http://${hostname}:7080/api/launcher/status?t=${Date.now()}`);
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          updateStatusUI(data);
        }
      } catch {}
    }
  }

  function updateStatusUI(data) {
    const badge = document.getElementById('header-status-badge');
    const badgeText = document.getElementById('status-text');
    const forecastStateEl = document.getElementById('forecast-state-text');
    const networkPill = document.getElementById('network-pill');
    const activeAlertBanner = document.getElementById('active-alert-banner');
    const alertBannerText = document.getElementById('alert-banner-text');

    const obs = data.obs || {};
    const phase = obs.phase || (obs.processAlive ? 'running' : 'stopped');

    if (badge && badgeText) {
      badge.className = 'status-badge ' + (phase === 'running' ? 'running' : (phase === 'starting' ? 'starting' : (obs.error ? 'error' : 'stopped')));
      badgeText.textContent = phase.toUpperCase() + (obs.output ? ` (${obs.output.toUpperCase()})` : '');
    }

    if (forecastStateEl) {
      const fState = (data.forecast && data.forecast.state) ? data.forecast.state.toUpperCase() : 'IDLE';
      forecastStateEl.textContent = fState;
      forecastStateEl.style.color = fState === 'RUNNING' ? 'var(--emerald)' : 'var(--muted)';
    }

    if (networkPill && data.ips && data.ips.length) {
      networkPill.innerHTML = `Deck IP: <b>${data.ips[0]}:${window.location.port || 7080}</b>`;
    }

    // Active alert banner
    if (data.alert && data.alert.action === 'trigger' && data.alert.type) {
      if (activeAlertBanner) activeAlertBanner.style.display = 'flex';
      if (alertBannerText) alertBannerText.textContent = `Active Alert: ${data.alert.type}`;
    } else if (data.alert && (data.alert.action === 'quebec' || data.alert.action === 'all')) {
      if (activeAlertBanner) activeAlertBanner.style.display = 'flex';
      if (alertBannerText) alertBannerText.textContent = `Active Alert: ${data.alert.action === 'quebec' ? 'Québec En Alerte' : 'All Disaster Alerts'}`;
    } else {
      if (activeAlertBanner) activeAlertBanner.style.display = 'none';
    }

    // Encoding preset UI sync
    if (data.encoding) {
      const encPill = document.getElementById('current-encoding-pill');
      if (encPill) encPill.textContent = `${data.encoding.resolution} @ ${data.encoding.fps}fps`;
      document.querySelectorAll('.encoding-res-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-res') === data.encoding.resolution);
      });
      document.querySelectorAll('.encoding-fps-btn').forEach(btn => {
        btn.classList.toggle('active', Number(btn.getAttribute('data-fps')) === Number(data.encoding.fps));
      });
    }

    // Interpolation UI sync
    if (data.interpolation !== undefined) {
      document.querySelectorAll('.interpolation-btn').forEach(btn => {
        const isEnabled = btn.getAttribute('data-enabled') === 'true';
        btn.classList.toggle('active', isEnabled === !!data.interpolation);
      });
    }

    // Update PC hardware stats
    updateSystemStatsUI(data.system, data);
  }

  function updateSystemStatsUI(sys) {
    if (!sys) return;

    // Hostname / Device
    const hostEl = document.getElementById('stat-hostname');
    if (hostEl && sys.hostname) {
      hostEl.textContent = `${sys.hostname} (${sys.platform || 'Linux'})`;
    }

    // CPU USAGE
    const cpuVal = document.getElementById('stat-cpu-usage');
    const cpuBar = document.getElementById('stat-cpu-usage-bar');
    if (cpuVal && sys.cpu) {
      const usage = typeof sys.cpu.usage === 'number' ? sys.cpu.usage : 0;
      cpuVal.textContent = `${usage.toFixed(1)}%`;
      if (cpuBar) {
        cpuBar.style.width = `${Math.min(100, Math.max(0, usage))}%`;
        cpuBar.className = 'stat-bar-fill' + (usage >= 90 ? ' hot' : (usage >= 75 ? ' warm' : ''));
      }
    }

    // CPU TEMP
    const tempVal = document.getElementById('stat-cpu-temp');
    const tempBar = document.getElementById('stat-cpu-temp-bar');
    if (tempVal && sys.cpu && sys.cpu.temp) {
      const c = sys.cpu.temp.celsius;
      const f = sys.cpu.temp.fahrenheit;
      tempVal.textContent = `${c}°C (${f}°F)`;
      if (tempBar) {
        const tempPct = Math.min(100, Math.max(0, ((c - 30) / 70) * 100));
        tempBar.style.width = `${tempPct}%`;
        tempBar.className = 'stat-bar-fill' + (c >= 85 ? ' hot' : (c >= 72 ? ' warm' : ' stat-temp-bar'));
      }
    } else if (tempVal) {
      tempVal.textContent = 'N/A';
      if (tempBar) tempBar.style.width = '0%';
    }

    // GPU USAGE
    const gpuVal = document.getElementById('stat-gpu-usage');
    const gpuBar = document.getElementById('stat-gpu-usage-bar');
    if (gpuVal && sys.gpu) {
      const gUsage = typeof sys.gpu.usage === 'number' ? sys.gpu.usage : 0;
      gpuVal.textContent = `${gUsage}%`;
      if (gpuBar) {
        gpuBar.style.width = `${Math.min(100, Math.max(0, gUsage))}%`;
        gpuBar.className = 'stat-bar-fill' + (gUsage >= 90 ? ' hot' : (gUsage >= 75 ? ' warm' : ''));
      }
    }

    // RAM
    const ramDetail = document.getElementById('stat-ram-detail');
    const ramPct = document.getElementById('stat-ram-pct');
    const ramBar = document.getElementById('stat-ram-bar');
    if (sys.ram) {
      if (ramDetail) ramDetail.textContent = `${sys.ram.usedGb} / ${sys.ram.totalGb} GB`;
      if (ramPct) ramPct.textContent = `${sys.ram.usagePercent}%`;
      if (ramBar) {
        const rPct = Math.min(100, Math.max(0, sys.ram.usagePercent || 0));
        ramBar.style.width = `${rPct}%`;
        ramBar.className = 'stat-bar-fill' + (rPct >= 90 ? ' hot' : (rPct >= 80 ? ' warm' : ''));
      }
    }

    // DISK
    const diskDetail = document.getElementById('stat-disk-detail');
    const diskPct = document.getElementById('stat-disk-pct');
    const diskBar = document.getElementById('stat-disk-bar');
    if (sys.disk) {
      if (diskDetail) diskDetail.textContent = `${sys.disk.usedGb} / ${sys.disk.totalGb} GB`;
      if (diskPct) diskPct.textContent = `${sys.disk.usagePercent}%`;
      if (diskBar) {
        const dPct = Math.min(100, Math.max(0, sys.disk.usagePercent || 0));
        diskBar.style.width = `${dPct}%`;
        diskBar.className = 'stat-bar-fill' + (dPct >= 90 ? ' hot' : (dPct >= 80 ? ' warm' : ''));
      }
    }
  }

  // Logs fetching
  async function fetchLogs() {
    const pre = document.getElementById('log-pre');
    const modalPre = document.getElementById('modal-log-pre');
    if (!pre) return;
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/launcher/logs`);
      if (!res.ok) return;
      const text = await res.text();
      const content = text || 'No broadcast logs recorded yet.';
      pre.textContent = content;
      if (modalPre) modalPre.textContent = content;
      if (logAutoScroll) {
        pre.scrollTop = pre.scrollHeight;
        if (modalPre) modalPre.scrollTop = modalPre.scrollHeight;
      }
    } catch (e) {}
  }

  // Script Runner Modal
  async function openScriptsModal() {
    touchFeedback();
    const modal = document.getElementById('scripts-modal');
    const list = document.getElementById('scripts-list');
    if (!modal || !list) return;

    list.innerHTML = '<p style="color: var(--muted)">Loading available project scripts...</p>';
    modal.showModal();

    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/launcher/scripts`);
      const data = await res.json();
      list.innerHTML = '';
      if (data.scripts && data.scripts.length) {
        data.scripts.forEach(script => {
          const btn = document.createElement('button');
          btn.className = 'touch-btn btn-subtle';
          btn.style.width = '100%';
          btn.style.justifyContent = 'flex-start';
          btn.innerHTML = `<span class="btn-icon">⚡</span> <span>npm run <b>${script}</b></span>`;
          btn.onclick = async () => {
            modal.close();
            showToast(`Running npm run ${script}...`);
            await apiAction('run-script', { script });
          };
          list.appendChild(btn);
        });
      } else {
        list.innerHTML = '<p>No scripts found in package.json.</p>';
      }
    } catch (e) {
      list.innerHTML = `<p style="color: var(--rose)">Error loading scripts: ${e.message}</p>`;
    }
  }

  // Setup DOM Event Listeners
  function init() {
    // Quick Controls
    document.getElementById('btn-start-hls')?.addEventListener('click', () => apiAction('start-obs', { output: 'hls' }));
    document.getElementById('btn-start-ndi')?.addEventListener('click', () => apiAction('start-obs', { output: 'ndi' }));
    document.getElementById('btn-start-youtube')?.addEventListener('click', () => apiAction('start-obs', { output: 'youtube' }));
    document.getElementById('btn-start-dual')?.addEventListener('click', () => apiAction('start-obs', { output: 'dual' }));
    
    // Stop broadcast confirmation
    const stopModal = document.getElementById('stop-modal');
    document.getElementById('btn-stop-obs')?.addEventListener('click', () => {
      touchFeedback();
      if (stopModal) stopModal.showModal();
    });
    document.getElementById('btn-confirm-stop')?.addEventListener('click', () => {
      if (stopModal) stopModal.close();
      apiAction('stop-obs');
    });
    document.getElementById('btn-cancel-stop')?.addEventListener('click', () => {
      touchFeedback();
      if (stopModal) stopModal.close();
    });

    // Sleep monitors confirmation
    const sleepMonitorsModal = document.getElementById('sleep-monitors-modal');
    const openSleepModal = () => {
      touchFeedback();
      if (sleepMonitorsModal) sleepMonitorsModal.showModal();
    };
    document.getElementById('btn-sleep-monitors')?.addEventListener('click', openSleepModal);
    document.getElementById('btn-header-sleep-monitors')?.addEventListener('click', openSleepModal);

    document.getElementById('btn-cancel-sleep-monitors')?.addEventListener('click', () => {
      touchFeedback();
      if (sleepMonitorsModal) sleepMonitorsModal.close();
    });

    document.getElementById('btn-confirm-sleep-monitors')?.addEventListener('click', async () => {
      if (sleepMonitorsModal) sleepMonitorsModal.close();
      showToast('Putting all monitors to sleep... (tap screen to wake)');
      await apiAction('sleep-monitors');
    });

    // Close instance confirmation
    const closeInstanceModal = document.getElementById('close-instance-modal');
    const openCloseModal = () => {
      touchFeedback();
      if (closeInstanceModal) closeInstanceModal.showModal();
    };
    document.getElementById('btn-close-instance')?.addEventListener('click', openCloseModal);
    document.getElementById('btn-header-close-instance')?.addEventListener('click', openCloseModal);

    document.getElementById('btn-cancel-close-instance')?.addEventListener('click', () => {
      touchFeedback();
      if (closeInstanceModal) closeInstanceModal.close();
    });

    document.getElementById('btn-confirm-close-instance')?.addEventListener('click', async () => {
      if (closeInstanceModal) closeInstanceModal.close();
      showToast('Closing IntelliSTAR instance completely...');
      try {
        await apiAction('close-instance');
      } catch (e) {}

      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#050b16;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;">
          <div style="font-size:56px;margin-bottom:16px;">⏻</div>
          <h2 style="margin:0 0 8px 0;font-size:24px;">Instance Closed</h2>
          <p style="color:#94a3b8;font-size:15px;margin:0 0 20px 0;">The broadcast and launcher instance have been shut down.</p>
          <p style="color:#64748b;font-size:13px;">You may now close this window or tab.</p>
        </div>
      `;
      try { window.close(); } catch (e) {}
    });

    document.getElementById('btn-forecast-start')?.addEventListener('click', () => apiAction('forecast-start'));
    document.getElementById('btn-forecast-stop')?.addEventListener('click', () => apiAction('forecast-stop'));
    document.getElementById('btn-refresh')?.addEventListener('click', () => apiAction('refresh'));

    // Encoding Presets
    document.querySelectorAll('.encoding-res-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const resolution = btn.getAttribute('data-res');
        const activeFpsBtn = document.querySelector('.encoding-fps-btn.active');
        const fps = activeFpsBtn ? activeFpsBtn.getAttribute('data-fps') : '60';
        const res = await apiAction('set-encoding', { resolution, fps });
        if (res && res.success) {
          showToast(`Preset: ${res.encoding.resolution.toUpperCase()} @ ${res.encoding.fps}fps (${res.encoding.bitrate})`);
          refreshStatus();
        }
      });
    });

    document.querySelectorAll('.encoding-fps-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fps = btn.getAttribute('data-fps');
        const activeResBtn = document.querySelector('.encoding-res-btn.active');
        const resolution = activeResBtn ? activeResBtn.getAttribute('data-res') : '1080p';
        const res = await apiAction('set-encoding', { resolution, fps });
        if (res && res.success) {
          showToast(`Preset: ${res.encoding.resolution.toUpperCase()} @ ${res.encoding.fps}fps (${res.encoding.bitrate})`);
          refreshStatus();
        }
      });
    });

    // Image Interpolation
    document.querySelectorAll('.interpolation-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const enabled = btn.getAttribute('data-enabled') === 'true';
        const res = await apiAction('set-interpolation', { enabled });
        if (res && res.success) {
          showToast(`Interpolation: ${enabled ? 'Enabled' : 'Disabled'}`);
          refreshStatus();
        }
      });
    });

    // Duration pills
    document.querySelectorAll('.pill-btn[data-dur]').forEach(btn => {
      btn.addEventListener('click', () => {
        touchFeedback();
        document.querySelectorAll('.pill-btn[data-dur]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDuration = parseInt(btn.getAttribute('data-dur'), 10) || 0;
      });
    });

    // Alert buttons
    document.querySelectorAll('.alert-card-btn[data-alert]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-alert');
        if (type === 'clear') {
          apiAction('alert-clear');
        } else if (type === 'quebec') {
          apiAction('alert', { action: 'quebec', duration: currentDuration });
        } else if (type === 'all') {
          apiAction('alert', { action: 'all', duration: currentDuration });
        } else {
          apiAction('alert', { type, duration: currentDuration });
        }
      });
    });

    // LDL Message
    const msgInput = document.getElementById('message-input');
    document.getElementById('btn-send-message')?.addEventListener('click', () => {
      const text = (msgInput?.value || '').trim();
      if (text) {
        apiAction('message', { text });
      } else {
        showToast('Please enter a message', true);
      }
    });

    document.getElementById('btn-clear-message')?.addEventListener('click', () => {
      if (msgInput) msgInput.value = '';
      apiAction('message-clear');
    });

    // Preset Message chips
    document.querySelectorAll('.chip-btn[data-msg]').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-msg');
        if (msgInput) msgInput.value = text;
        apiAction('message', { text });
      });
    });

    // Tools
    document.getElementById('btn-tool-editor')?.addEventListener('click', () => {
      touchFeedback();
      window.open('http://' + window.location.hostname + ':7070/editor.html', '_blank');
      apiAction('open-editor');
    });
    document.getElementById('btn-tool-vlc')?.addEventListener('click', () => apiAction('open-vlc'));
    document.getElementById('btn-tool-check')?.addEventListener('click', () => apiAction('check-setup', { output: 'hls' }));
    document.getElementById('btn-tool-setup')?.addEventListener('click', () => apiAction('setup-hls'));
    document.getElementById('btn-tool-scripts')?.addEventListener('click', openScriptsModal);
    document.getElementById('btn-close-scripts')?.addEventListener('click', () => {
      touchFeedback();
      document.getElementById('scripts-modal')?.close();
    });

    // Logs toolbar & modal
    document.getElementById('btn-refresh-logs')?.addEventListener('click', () => {
      touchFeedback();
      fetchLogs();
    });
    document.getElementById('btn-autoscroll-logs')?.addEventListener('click', () => {
      touchFeedback();
      logAutoScroll = !logAutoScroll;
      const btn = document.getElementById('btn-autoscroll-logs');
      if (btn) btn.textContent = logAutoScroll ? 'Scroll: ON' : 'Scroll: OFF';
    });
    document.getElementById('btn-expand-logs')?.addEventListener('click', () => {
      touchFeedback();
      const modal = document.getElementById('log-modal');
      if (modal) {
        modal.showModal();
        const modalPre = document.getElementById('modal-log-pre');
        if (modalPre) modalPre.scrollTop = modalPre.scrollHeight;
      }
    });
    document.getElementById('btn-close-log-modal')?.addEventListener('click', () => {
      touchFeedback();
      document.getElementById('log-modal')?.close();
    });

    // Initial load & intervals
    refreshStatus();
    fetchLogs();
    setInterval(refreshStatus, 2000);
    setInterval(fetchLogs, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

