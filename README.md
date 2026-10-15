# Signal Desk

A local-first encrypted password vault built with plain HTML, CSS, and JavaScript, with optional end-to-end encrypted synchronization through Supabase and Vercel Functions.

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
- Optional encrypted synchronization between browsers
- Sync authentication kept in HttpOnly cookies rather than browser storage
- Conflict detection when two browsers change different encrypted copies
- Responsive desktop/mobile interface
- Keyboard navigation and reduced-motion support

## Security notes

- The master password is never stored.
- Credential fields are encrypted together; locked storage does not expose service names or email addresses.
- Backup files remain encrypted and are decrypted successfully before replacing the current vault.
- Forgotten master passwords cannot be recovered.
- The sync account password and vault master password are separate. The server never receives the master password.
- Supabase stores the account email, encrypted envelope, revision, and update time—not decrypted credentials.
- An attacker controlling an unlocked browser can still read what the page can read. Cross-browser sync protects stored and transmitted data, not an already-compromised unlocked device.
- This is a personal first-version vault and has not received an independent professional security audit.

## Enable cross-browser sync

1. Create a Supabase project.
2. In its SQL Editor, run `supabase/migrations/001_encrypted_vault_sync.sql` once. This creates the encrypted-vault table and owner-only row-level security policies.
3. In Supabase Authentication settings, configure the site URL for your Vercel domain. Keep email confirmation enabled for safer account creation.
4. In Vercel, add these project environment variables for Production, Preview, and Development:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

5. Redeploy. Open **Encrypted sync**, create a sync account, and confirm the email if requested.
6. On another browser, open the same Vercel URL, select **Open a synced vault**, and sign in with the sync account. Signal Desk downloads the ciphertext. Enter the same vault master password to decrypt it locally.

Never add the Supabase service-role key to this project. The anon key is intentionally used with each user's JWT so the database row-level policies remain the authorization boundary.

When running only `python -m http.server`, the vault continues to work locally but `/api` sync endpoints are unavailable. Use `vercel dev` with environment variables to test sync locally.
    
## Verification

`tests/smoke.cjs` exercises vault creation, encrypted persistence, credential entry, search, selection, lock/unlock, and desktop/mobile rendering. It uses the bundled Playwright package and installed Microsoft Edge.
