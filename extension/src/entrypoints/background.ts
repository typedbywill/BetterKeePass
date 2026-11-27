import { defineBackground } from 'wxt/utils/define-background';
import type { ClientRequest, HostResponse } from '../lib/protocol';

const NATIVE_HOST_NAME = 'org.betterkeepass.proxy';

function sendNativeRequest(request: ClientRequest): Promise<HostResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response: HostResponse) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({
            type: 'Error',
            code: 'AppOffline',
            message: lastError.message ?? 'Native host inacessível',
          });
          return;
        }
        resolve(
          response ?? {
            type: 'Error',
            code: 'AppOffline',
            message: 'Sem resposta do BetterKeePass',
          },
        );
      });
    } catch (error) {
      resolve({
        type: 'Error',
        code: 'AppOffline',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  });
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('bkpRequest' in message)) {
      return false;
    }

    const request = (message as { bkpRequest: ClientRequest }).bkpRequest;
    void sendNativeRequest(request).then(sendResponse);
    return true;
  });
});
