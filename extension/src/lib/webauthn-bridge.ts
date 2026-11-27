import {
  base64UrlToBytes,
  bufferSourceToBytes,
  bytesToBase64Url,
  type CreateCredentialRequest,
  type CreateCredentialResponse,
  type GetAssertionRequest,
  type GetAssertionResponse,
  type PasskeyAlgorithm,
} from './protocol';

export function buildClientDataJson(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: BufferSource,
  origin: string,
): Uint8Array {
  const payload = JSON.stringify({
    type,
    challenge: bytesToBase64Url(bufferSourceToBytes(challenge)),
    origin,
    crossOrigin: false,
  });
  return new TextEncoder().encode(payload);
}

export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}

export function pickSupportedAlgorithm(
  pubKeyCredParams: PublicKeyCredentialParameters[] | undefined,
): PasskeyAlgorithm {
  if (pubKeyCredParams?.some((p) => p.alg === -8)) {
    return -8;
  }
  return -7;
}

export async function toCreateCredentialRequest(
  publicKey: PublicKeyCredentialCreationOptions,
  origin: string,
): Promise<{ request: CreateCredentialRequest; clientDataJson: Uint8Array }> {
  const clientDataJson = buildClientDataJson('webauthn.create', publicKey.challenge, origin);
  const clientDataHash = await sha256Bytes(clientDataJson);
  const rpId = publicKey.rp.id ?? new URL(origin).hostname;

  return {
    clientDataJson,
    request: {
      rpId,
      rpName: publicKey.rp.name,
      username: publicKey.user.name,
      userDisplayName: publicKey.user.displayName,
      userHandleB64: bytesToBase64Url(bufferSourceToBytes(publicKey.user.id)),
      clientDataHashB64: bytesToBase64Url(clientDataHash),
      algorithm: pickSupportedAlgorithm(publicKey.pubKeyCredParams),
      userVerified: true,
    },
  };
}

export async function toGetAssertionRequest(
  publicKey: PublicKeyCredentialRequestOptions,
  origin: string,
): Promise<{
  request: GetAssertionRequest;
  allowCredentialIds: string[];
  clientDataJson: Uint8Array;
}> {
  const clientDataJson = buildClientDataJson('webauthn.get', publicKey.challenge, origin);
  const clientDataHash = await sha256Bytes(clientDataJson);
  const rpId = publicKey.rpId ?? new URL(origin).hostname;
  const allowCredentialIds = (publicKey.allowCredentials ?? []).map((cred) =>
    bytesToBase64Url(bufferSourceToBytes(cred.id)),
  );

  return {
    clientDataJson,
    allowCredentialIds,
    request: {
      rpId,
      clientDataHashB64: bytesToBase64Url(clientDataHash),
      userVerified: true,
    },
  };
}

export function buildSyntheticCreateCredential(
  response: CreateCredentialResponse,
  clientDataJson: Uint8Array,
): Record<string, unknown> {
  const rawId = base64UrlToBytes(response.credentialIdB64).buffer;
  const attestationObject = base64UrlToBytes(response.attestationObjectB64).buffer;
  const authenticatorData = base64UrlToBytes(response.authDataB64).buffer;
  const publicKey = base64UrlToBytes(response.publicKeyCoseB64).buffer;
  const clientDataJSON = clientDataJson.buffer.slice(
    clientDataJson.byteOffset,
    clientDataJson.byteOffset + clientDataJson.byteLength,
  );

  return {
    id: response.credentialIdB64,
    rawId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({}),
    response: {
      clientDataJSON,
      attestationObject,
      getTransports: () => ['internal'],
      getAuthenticatorData: () => authenticatorData,
      getPublicKey: () => publicKey,
      getPublicKeyAlgorithm: () => -7,
    },
  };
}

export function buildSyntheticAssertionCredential(
  response: GetAssertionResponse,
  clientDataJson: Uint8Array,
): Record<string, unknown> {
  const rawId = base64UrlToBytes(response.credentialIdB64).buffer;
  const authenticatorData = base64UrlToBytes(response.authenticatorDataB64).buffer;
  const signature = base64UrlToBytes(response.signatureB64).buffer;
  const userHandle = response.userHandleB64
    ? base64UrlToBytes(response.userHandleB64).buffer
    : null;
  const clientDataJSON = clientDataJson.buffer.slice(
    clientDataJson.byteOffset,
    clientDataJson.byteOffset + clientDataJson.byteLength,
  );

  return {
    id: response.credentialIdB64,
    rawId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({}),
    response: {
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
    },
  };
}
