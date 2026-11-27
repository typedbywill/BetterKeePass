export type PasskeyAlgorithm = -7 | -8;

export interface CreateCredentialRequest {
  rpId: string;
  rpName: string;
  username: string;
  userDisplayName: string;
  userHandleB64: string;
  clientDataHashB64: string;
  algorithm: PasskeyAlgorithm;
  userVerified: boolean;
}

export interface CreateCredentialResponse {
  credentialIdB64: string;
  attestationObjectB64: string;
  authDataB64: string;
  publicKeyCoseB64: string;
}

export interface GetAssertionRequest {
  rpId: string;
  clientDataHashB64: string;
  userVerified: boolean;
}

export interface GetAssertionResponse {
  credentialIdB64: string;
  authenticatorDataB64: string;
  signatureB64: string;
  userHandleB64: string;
  signCount: number;
}

export interface LoginCandidate {
  entryUuid: string;
  title: string;
  username: string;
  password: string;
  totp?: string;
}

export type ClientRequest =
  | { type: 'Ping' }
  | { type: 'PairInit'; browser_name: string; client_public_key_b64: string }
  | { type: 'GetLogins'; origin: string }
  | { type: 'SaveLogin'; origin: string; title: string; username: string; password: string }
  | { type: 'GetTotp'; entry_uuid: string }
  | { type: 'PasskeyCreate'; request: CreateCredentialRequest }
  | { type: 'PasskeyGet'; request: GetAssertionRequest; allow_credential_ids: string[] };

export type HostResponse =
  | { type: 'Pong'; version: string; vault_unlocked: boolean }
  | { type: 'PairChallenge'; challenge: { browserId: string; confirmationCode: string } }
  | { type: 'Logins'; candidates: LoginCandidate[] }
  | { type: 'LoginSaved'; entry_uuid: string }
  | { type: 'Totp'; code: string; valid_for_secs: number }
  | { type: 'PasskeyCreated'; response: CreateCredentialResponse }
  | { type: 'PasskeyAssertion'; response: GetAssertionResponse }
  | { type: 'Error'; code: string; message: string };

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bufferSourceToBytes(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}
