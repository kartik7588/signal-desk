# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML, CSS, and JavaScript. The first version is a local web app with no required server or cloud account.

## Users

The initial user is the owner of the vault, using it personally to keep account credentials available without repeatedly resetting forgotten passwords.

## Product Purpose

Provide a secure, searchable personal vault for email addresses, usernames, and passwords. Success means the user can quickly find an account—such as by searching for “Claude”—and safely retrieve or copy its credentials.

## Positioning

A focused, local-first personal vault that prioritizes calm retrieval, legibility, and explicit security state over feature-heavy password-manager complexity.

## Operating Context

The user opens the app locally, unlocks it with a master password, searches or browses saved accounts, copies the needed credential, and locks the vault when finished.

## Capabilities and Constraints

- Create, view, edit, delete, search, and organize credential entries.
- Search must match service names, domains, usernames or email addresses, tags, and optionally notes.
- Credentials must be encrypted at rest and decrypted only while the vault is unlocked.
- The first version is local-only and does not include cloud synchronization or multi-user sharing.
- The interface will be implemented without a frontend framework.
- Encrypted backup and restore are part of the planned product.

## Evidence on Hand

No logo, established visual identity, user research, testimonials, or marketing claims are available. Future work must not fabricate them.

## Product Principles

- Security state should always be understandable.
- Retrieval should be fast enough to feel immediate.
- Sensitive information stays concealed until deliberately revealed.
- The interface should feel personal and crafted, not like a generic administration dashboard.
- Advanced capabilities should not obstruct the everyday find-and-copy workflow.

## Accessibility & Inclusion

Keyboard navigation, visible focus states, sufficient contrast, reduced-motion support, and screen-reader labels are required for all core workflows.
