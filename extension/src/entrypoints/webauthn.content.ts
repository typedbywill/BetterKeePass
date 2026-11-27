import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ClientRequest, HostResponse } from '../lib/protocol';
import {
  buildSyntheticAssertionCredential,
  buildSyntheticCreateCredential,
  toCreateCredentialRequest,
  toGetAssertionRequest,
} from '../lib/webauthn-bridge';

const BRIDGE_CHANNEL = 'betterkeepass-webauthn-bridge';

function callBackground(bkpRequest: ClientRequest): Promise<HostResponse> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { channel?: string; requestId?: string; response?: HostResponse };
      if (data?.channel !== `${BRIDGE_CHANNEL}:response` || data.requestId !== requestId) {
        return;
      }
      window.removeEventListener('message', onMessage);
      resolve(
        data.response ?? {
          type: 'Error',
          code: 'AppOffline',
          message: 'Falha na ponte de extensão',
        },
      );
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ channel: `${BRIDGE_CHANNEL}:request`, requestId, bkpRequest }, '*');
    setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve({ type: 'Error', code: 'AppOffline', message: 'Timeout no BetterKeePass' });
    }, 30000);
  });
}

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    if (!navigator.credentials) return;

    const originalCreate = navigator.credentials.create.bind(navigator.credentials);
    const originalGet = navigator.credentials.get.bind(navigator.credentials);

    navigator.credentials.create = async (options?: CredentialCreationOptions) => {
      if (!options?.publicKey) {
        return originalCreate(options);
      }

      const { request, clientDataJson } = await toCreateCredentialRequest(
        options.publicKey,
        window.location.origin,
      );
      const response = await callBackground({ type: 'PasskeyCreate', request });
      if (response.type === 'PasskeyCreated') {
        return buildSyntheticCreateCredential(
          response.response,
          clientDataJson,
        ) as unknown as Credential;
      }

      if (response.type === 'Error') {
        if (response.code === 'AppOffline' || response.code === 'UserCancelled') {
          return originalCreate(options);
        }
        throw new DOMException(response.message, 'NotAllowedError');
      }
      return originalCreate(options);
    };

    navigator.credentials.get = async (options?: CredentialRequestOptions) => {
      if (!options?.publicKey || options.mediation === 'silent') {
        return originalGet(options);
      }

      const { request, allowCredentialIds, clientDataJson } = await toGetAssertionRequest(
        options.publicKey,
        window.location.origin,
      );
      const response = await callBackground({
        type: 'PasskeyGet',
        request,
        allow_credential_ids: allowCredentialIds,
      });
      if (response.type === 'PasskeyAssertion') {
        return buildSyntheticAssertionCredential(
          response.response,
          clientDataJson,
        ) as unknown as Credential;
      }

      if (response.type === 'Error') {
        if (response.code === 'AppOffline' || response.code === 'UserCancelled') {
          return originalGet(options);
        }
        throw new DOMException(response.message, 'NotAllowedError');
      }
      return originalGet(options);
    };
  },
});
