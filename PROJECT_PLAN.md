# Signal Desk — Project Plan

## 1. Product goal

Build a local-first personal password vault using plain HTML, CSS, and JavaScript. The user unlocks one encrypted vault, searches for an account such as “Claude,” and safely copies or views its credentials. No cloud service or account is required for the first release.

The selected interface direction is **Signal Desk**: a search-led working surface inspired by a precise operator console. The metaphor governs hierarchy, state, and motion without replacing familiar controls or security terminology.

## 2. Release-one scope

### Included

- Master-password setup and vault unlocking
- Authenticated local encryption
- Add, edit, view, and delete credentials
- Instant search across service, domain, username/email, and tags
- Favorites and recently used entries
- Secure password generator
- Copy and temporary reveal actions
- Automatic and manual vault locking
- Encrypted backup export and import
- Desktop and mobile-responsive layouts
- Keyboard and screen-reader support
- Empty, error, loading, and recovery states

### Deliberately excluded

- Cloud synchronization
- Browser extension and autofill
- Multiple users or shared vaults
- Email-based master-password recovery
- Public accounts or a backend server
- Unencrypted export by default
- Payment cards, passkeys, and TOTP in the initial release

## 3. Technical structure

```text
email storer/
├── index.html
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── states.css
│   └── responsive.css
├── js/
│   ├── app.js
│   ├── state.js
│   ├── router.js
│   ├── crypto/
│   │   ├── key-derivation.js
│   │   ├── vault-crypto.js
│   │   └── secure-random.js
│   ├── storage/
│   │   ├── database.js
│   │   ├── migrations.js
│   │   └── backup.js
│   ├── features/
│   │   ├── unlock.js
│   │   ├── credentials.js
│   │   ├── search.js
│   │   ├── generator.js
│   │   ├── clipboard.js
│   │   └── auto-lock.js
│   ├── ui/
│   │   ├── render.js
│   │   ├── dialogs.js
│   │   ├── announcements.js
│   │   └── focus.js
│   └── utils/
├── assets/
│   ├── icons/
│   └── fonts/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── PRODUCT.md
└── PROJECT_PLAN.md
```

Use native ES modules and a small development server. Avoid a frontend framework and avoid runtime dependencies unless they solve a security-critical problem that the platform cannot safely provide.

## 4. Data and encryption design

### Vault envelope

The local database stores only an encrypted vault envelope:

```text
version
keyDerivationParameters
salt
wrappedVaultKey
wrappedVaultKeyNonce
encryptedPayload
payloadNonce
createdAt
updatedAt
```

The decrypted payload contains credential records and vault preferences. Service names, email addresses, tags, notes, and passwords are encrypted together so a locked database does not expose an account inventory.

### Key lifecycle

1. Generate a random vault key with a cryptographically secure random source.
2. Derive a key-encryption key from the master password using Argon2id.
3. Use the derived key only to encrypt or decrypt the vault key.
4. Use the vault key to encrypt the credential payload with authenticated encryption.
5. Keep decrypted keys and credentials in memory only while unlocked.
6. Drop all references to decrypted state when the vault locks.
7. Generate a fresh nonce for every encryption operation.

Use AES-256-GCM through the Web Crypto API for payload encryption. Argon2id requires a narrowly scoped, reviewed implementation because it is not supplied by Web Crypto.

### Storage

- Store the encrypted envelope in IndexedDB.
- Use an explicit schema version and migration system.
- Complete encryption before replacing the previous saved envelope.
- Preserve the last known-good envelope if a write fails.
- Never store decrypted credentials in localStorage, sessionStorage, URLs, service-worker caches, or logs.

## 5. Application state

The application has three top-level security states:

```text
UNINITIALIZED → LOCKED → UNLOCKED
                    ↑         │
                    └─────────┘
```

- `UNINITIALIZED`: no vault exists; master-password setup is shown.
- `LOCKED`: only encrypted data and safe metadata are available.
- `UNLOCKED`: decrypted credentials and the in-memory search index are available.

Locking must clear the selected credential, search results, revealed password state, decrypted payload, and derived keys.

## 6. Search system

Build the search index only after the vault is unlocked. Normalize service names, domains, usernames, emails, and tags for case-insensitive matching.

Ranking order:

1. Exact service-name match
2. Service-name prefix
3. Domain match
4. Username or email match
5. Tag match
6. Remaining substring matches

Search updates on every input without a visible loading state for ordinary vault sizes. The initial performance target is under 50 ms for 5,000 entries on a typical desktop.

Keyboard behavior:

- `/` or `Ctrl+K`: focus search
- Arrow keys: move through results
- `Enter`: select the active result
- `Escape`: clear the query, then close details
- `Ctrl+C` while a copy control is focused: perform that explicit copy action

## 7. Interface architecture

### Unlock surface

- Product name and clear local-only statement
- Master-password field
- Unlock action
- Import-backup secondary action
- Caps Lock warning
- Specific but non-revealing error feedback

### Unlocked desktop surface

- Narrow top status strip
- Large search field as the primary control
- Results occupying the main working field
- Stable credential-detail area
- Add-entry and lock actions available without dominating search

### Mobile surface

- Search and results form the default view.
- Selecting a result moves to a dedicated detail view.
- A visible back action returns to the preserved query and scroll position.
- Essential copy and reveal actions remain reachable without horizontal scrolling.

### Entry editor

- Service name
- Website URL
- Email or username
- Password and generator
- Tags
- Notes
- Save and cancel
- Delete isolated in a separate danger area during editing

## 8. Signal Desk design rules

- Search owns the strongest scale and contrast.
- Use one continuous working surface rather than a card grid.
- Mechanical seams establish regions; elevation is rare.
- Vermilion indicates one active route or urgent state, never decoration.
- State changes use labels, icons, and structure in addition to color.
- Standard terms such as Search, Copy password, Reveal, Edit, Delete, and Lock remain intact.
- The routing line appears only between an active result and its detail view.
- Motion is brief, directional, and disabled under reduced-motion preferences.
- No permanent sidebar, glass panels, gradients, neon, excessive pills, or hover-only controls.

## 9. Delivery milestones

### Milestone 1 — Foundation and threat model

- Establish file structure and development tooling.
- Document assets, attackers, trust boundaries, and failure modes.
- Define the encrypted envelope and migration strategy.
- Establish test fixtures containing synthetic credentials only.

Exit criteria: encryption design and security invariants are documented before credential UI work begins.

### Milestone 2 — Approved visual composition

- Produce three Signal Desk layout compositions from the approved direction.
- Select one desktop composition.
- Derive its mobile structure.
- Define tokens for color, typography, spacing, borders, focus, and motion.
- Verify that the composition supports empty, dense, and error states.

Exit criteria: one composition is explicitly approved and becomes the spatial reference for implementation.

### Milestone 3 — Vault creation and unlocking

- Implement master-password setup.
- Implement key derivation, vault-key wrapping, and payload encryption.
- Implement IndexedDB persistence.
- Implement unlock failure and corrupted-vault states.
- Add manual locking and decrypted-state teardown.

Exit criteria: no plaintext credential data remains in persistent browser storage.

### Milestone 4 — Credential management

- Implement create, read, update, and delete operations.
- Add validation and unsaved-change protection.
- Add password generation.
- Preserve the previous encrypted envelope when a save fails.

Exit criteria: every credential operation survives reload and encryption round-trip tests.

### Milestone 5 — Search-first workspace

- Build the in-memory search index.
- Implement ranking and highlighted matches.
- Add keyboard traversal and selection.
- Add the Signal Desk route transition.
- Add recent and favorite entries for the empty-query state.

Exit criteria: searching `claude` finds and opens the expected entry entirely from the keyboard.

### Milestone 6 — Sensitive actions and auto-lock

- Add reveal, re-hide, and copy behavior.
- Clear clipboard contents after a short interval where supported.
- Add inactivity detection and pre-lock warning.
- Lock on explicit action and page lifecycle events where reliable.
- Ensure that hidden tabs do not leave revealed passwords indefinitely.

Exit criteria: locking clears every decrypted view and in-memory search artifact.

### Milestone 7 — Encrypted backup and restore

- Export a versioned encrypted backup.
- Validate file type, size, schema, authentication tag, and compatibility.
- Preview safe import metadata without exposing contents.
- Support replace and cancel flows; postpone merging unless necessary.
- Test corrupted, truncated, wrong-password, and newer-version backups.

Exit criteria: a fresh browser profile can restore a valid backup without any plaintext export.

### Milestone 8 — Accessibility and responsive completion

- Complete focus order, dialog focus trapping, and announcements.
- Test at 200% zoom and keyboard-only operation.
- Test reduced motion and high-contrast preferences.
- Validate 390 px mobile and 1440 px desktop layouts.
- Test long service names, long emails, many tags, and large vaults.

Exit criteria: every core workflow works without a mouse and without relying on color.

### Milestone 9 — Security and release verification

- Run unit, integration, and end-to-end tests.
- Inspect IndexedDB, browser storage, DOM, history, and console output for leaks.
- Test content injection through imported fields and notes.
- Apply a strict Content Security Policy.
- Audit third-party dependencies.
- Perform one bounded desktop/mobile visual review and correction pass.

Exit criteria: all release blockers are resolved and the built interface matches the approved composition.

## 10. Test strategy

### Unit tests

- Key derivation parameter handling
- Encryption and decryption round trips
- Nonce uniqueness safeguards
- Search normalization and ranking
- Password generation constraints
- Automatic-lock timers
- Schema validation and migrations

### Integration tests

- Create vault, save entries, reload, and unlock
- Change master password without losing entries
- Search, select, edit, and re-encrypt an entry
- Lock while a password is visible
- Import valid and invalid backups
- Recover safely from interrupted writes

### End-to-end tests

- First-run setup
- Search for `claude` and copy its password
- Keyboard-only account retrieval
- Mobile result-to-detail navigation
- Auto-lock after inactivity
- Wrong-password behavior
- Empty, no-results, storage-error, and corrupted-backup states

## 11. Security release blockers

Do not ship if any of the following are true:

- Plaintext credentials appear in persistent storage or logs.
- A nonce can be reused with the same encryption key.
- Locking leaves decrypted credential content accessible.
- Imported text can inject HTML or script.
- A failed save can overwrite the only valid vault copy.
- Backup integrity is not authenticated.
- The application silently weakens key-derivation parameters.
- Third-party scripts execute inside the vault surface.

## 12. Definition of done

Release one is complete when a user can create a local encrypted vault, add an account, search for `claude`, select the correct result, copy its credentials, lock the vault, reload the page, unlock it again, and restore it from an encrypted backup. The complete flow must work on desktop and mobile, by keyboard, without plaintext credential persistence, and with the built interface matching the approved Signal Desk composition.
