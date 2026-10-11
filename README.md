# Signal Desk

A local-first encrypted password vault built with plain HTML, CSS, and JavaScript.

## Run locally

The Web Crypto API requires a secure context. `localhost` qualifies, so serve the folder instead of opening `index.html` directly:

```powershell
python -m http.server 43877 --bind 127.0.0.1
```

Then open `http://127.0.0.1:43877/`.

## Included

- Master-password setup with confirmation
- AES-256-GCM authenticated encryption
- PBKDF2-SHA-256 key derivation with 600,000 iterations
- IndexedDB encrypted persistence
- Add, edit, delete, search, reveal, and copy workflows
- Cryptographically secure password generator
- Automatic locking
- Encrypted backup export and validated restore
- Responsive desktop/mobile interface
- Keyboard navigation and reduced-motion support

## Security notes

- The master password is never stored.
- Credential fields are encrypted together; locked storage does not expose service names or email addresses.
- Backup files remain encrypted and are decrypted successfully before replacing the current vault.
- Forgotten master passwords cannot be recovered.
- This is a personal first-version vault and has not received an independent professional security audit.
    
## Verification

`tests/smoke.cjs` exercises vault creation, encrypted persistence, credential entry, search, selection, lock/unlock, and desktop/mobile rendering. It uses the bundled Playwright package and installed Microsoft Edge.
