import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from '../src/lib/protocol';
import {
  buildSyntheticAssertionCredential,
  buildSyntheticCreateCredential,
  toCreateCredentialRequest,
  toGetAssertionRequest,
} from '../src/lib/webauthn-bridge';

describe('webauthn bridge', () => {
  it('encodes and decodes base64url roundtrip', () => {
    const raw = new Uint8Array([1, 2, 3, 250, 251, 255]);
    const encoded = bytesToBase64Url(raw);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(raw));
  });

  it('converts PublicKeyCredentialCreationOptions and builds synthetic credential', async () => {
    const challenge = new Uint8Array([9, 8, 7, 6]);
    const userId = new Uint8Array([10, 20, 30]);
    const { request, clientDataJson } = await toCreateCredentialRequest(
      {
        challenge,
        rp: { id: 'github.com', name: 'GitHub' },
        user: { id: userId, name: 'octocat', displayName: 'Octocat' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
      'https://github.com',
    );

    expect(request.rpId).toBe('github.com');
    expect(request.algorithm).toBe(-7);
    expect(request.username).toBe('octocat');

    const synthetic = buildSyntheticCreateCredential(
      {
        credentialIdB64: bytesToBase64Url(new Uint8Array([1, 2, 3, 4])),
        attestationObjectB64: bytesToBase64Url(new Uint8Array([5, 6])),
        authDataB64: bytesToBase64Url(new Uint8Array([7, 8])),
        publicKeyCoseB64: bytesToBase64Url(new Uint8Array([9, 10])),
      },
      clientDataJson,
    );
    expect(synthetic.type).toBe('public-key');
    expect(synthetic.id).toBe(bytesToBase64Url(new Uint8Array([1, 2, 3, 4])));
  });

  it('converts PublicKeyCredentialRequestOptions with allowCredentials', async () => {
    const credId = new Uint8Array([42, 43, 44]);
    const { request, allowCredentialIds, clientDataJson } = await toGetAssertionRequest(
      {
        challenge: new Uint8Array([1, 2, 3]),
        rpId: 'passkeys.io',
        allowCredentials: [{ type: 'public-key', id: credId }],
      },
      'https://passkeys.io',
    );

    expect(request.rpId).toBe('passkeys.io');
    expect(allowCredentialIds).toEqual([bytesToBase64Url(credId)]);

    const assertion = buildSyntheticAssertionCredential(
      {
        credentialIdB64: bytesToBase64Url(credId),
        authenticatorDataB64: bytesToBase64Url(new Uint8Array([1, 2])),
        signatureB64: bytesToBase64Url(new Uint8Array([3, 4])),
        userHandleB64: bytesToBase64Url(new Uint8Array([5])),
        signCount: 1,
      },
      clientDataJson,
    );
    expect(assertion.type).toBe('public-key');
  });
});
