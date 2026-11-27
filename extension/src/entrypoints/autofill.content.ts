import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ClientRequest, HostResponse, LoginCandidate } from '../lib/protocol';

const BRIDGE_CHANNEL = 'betterkeepass-webauthn-bridge';

async function sendToBackground(bkpRequest: ClientRequest): Promise<HostResponse> {
  return chrome.runtime.sendMessage({ bkpRequest });
}

function attachLoginBadge(passwordInput: HTMLInputElement) {
  if (passwordInput.dataset.bkpAttached === '1') return;
  passwordInput.dataset.bkpAttached = '1';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'BKP';
  button.title = 'Preencher com BetterKeePass';
  button.setAttribute('aria-label', 'Preencher login com BetterKeePass');
  button.style.cssText =
    'margin-left:6px;padding:2px 6px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#f8fafc;font-size:11px;cursor:pointer;';

  button.addEventListener('click', async () => {
    const resp = await sendToBackground({
      type: 'GetLogins',
      origin: window.location.origin,
    });
    if (resp.type !== 'Logins' || resp.candidates.length === 0) return;
    fillCandidate(passwordInput, resp.candidates[0]);
  });

  passwordInput.insertAdjacentElement('afterend', button);
}

function fillCandidate(passwordInput: HTMLInputElement, candidate: LoginCandidate) {
  const form = passwordInput.form;
  const userInput = form?.querySelector<HTMLInputElement>(
    'input[type="email"], input[type="text"], input[autocomplete="username"]',
  );
  if (userInput) {
    userInput.value = candidate.username;
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  passwordInput.value = candidate.password;
  passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
}

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*'],
  runAt: 'document_idle',
  main() {
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const data = event.data as { channel?: string; requestId?: string; bkpRequest?: ClientRequest };
      if (data?.channel !== `${BRIDGE_CHANNEL}:request` || !data.requestId || !data.bkpRequest) {
        return;
      }
      const response = await sendToBackground(data.bkpRequest);
      window.postMessage(
        { channel: `${BRIDGE_CHANNEL}:response`, requestId: data.requestId, response },
        '*',
      );
    });

    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
      attachLoginBadge(input);
    }
  },
});
