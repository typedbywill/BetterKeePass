import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'BetterKeePass',
    description: 'Autofill seguro, TOTP e Passkeys (WebAuthn) integrados ao BetterKeePass.',
    version: '0.1.0',
    permissions: ['nativeMessaging', 'storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
