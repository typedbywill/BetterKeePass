import type { ClientRequest, HostResponse } from '../../lib/protocol';

const statusBadge = document.getElementById('status-badge');
const originLabel = document.getElementById('origin-label');
const candidatesList = document.getElementById('candidates');
const refreshBtn = document.getElementById('refresh-btn');

async function requestBg(bkpRequest: ClientRequest): Promise<HostResponse> {
  return chrome.runtime.sendMessage({ bkpRequest });
}

async function refresh() {
  if (!statusBadge || !originLabel || !candidatesList) return;
  const ping = await requestBg({ type: 'Ping' });
  if (ping.type === 'Pong') {
    statusBadge.textContent = ping.vault_unlocked ? 'Desbloqueado' : 'Bloqueado';
    statusBadge.dataset.state = ping.vault_unlocked ? 'ok' : 'warn';
  } else {
    statusBadge.textContent = 'Offline';
    statusBadge.dataset.state = 'err';
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url ? new URL(tab.url).origin : '';
  originLabel.textContent = origin || 'Sem página ativa';
  candidatesList.replaceChildren();

  if (!origin) return;
  const logins = await requestBg({ type: 'GetLogins', origin });
  if (logins.type === 'Logins') {
    for (const item of logins.candidates) {
      const li = document.createElement('li');
      li.textContent = `${item.title} — ${item.username}`;
      candidatesList.appendChild(li);
    }
  }
}

refreshBtn?.addEventListener('click', () => {
  void refresh();
});

void refresh();
