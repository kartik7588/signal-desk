# Signal Desk Design System

## Direction

Signal Desk is a search-first operating surface inspired by a daylit telephone exchange. It uses physical clarity—enamel fields, ivory reading areas, dark controls, and one active signal—to make security state legible without cybersecurity clichés.

## Color

- Enamel: `#8ca087`
- Deep enamel: `#71856d`
- Ivory reading field: `#e9e7da`
- Forest ink: `#102611`
- Secondary ink: `#243825`
- Nickel plate: `#c3b9a8`
- Active signal: `#e75b3f`
- Danger: `#7e241a`

Vermilion is reserved for the active route, warnings, and dangerous states. It is not a decorative accent.

## Typography

Georgia supplies the compact display voice for the product name, search query, and account names. Trebuchet MS / Segoe UI supplies operational text. Consolas is limited to credential values where character distinction matters.

## Components

- Search instrument: the largest control and strongest visual hierarchy.
- Result lane: continuous horizontal account record with a single terminal signal.
- Credential dock: stable reading area for the selected account.
- Bakelite control: round dark icon button for compact actions.
- Status plate: bordered nickel field for persistent local/security state.
- Sheets: native modal dialogs reserved for focused add/edit/settings work.

## Interaction

Search updates immediately. Selection moves one route signal from the active result to the credential dock. Password reveal expires after 15 seconds. Reduced-motion preferences replace routed motion with immediate state changes.

## Responsive behavior

Desktop uses results and details side by side. Below 900px, account selection replaces the result list with a dedicated detail view and an explicit back action. Search remains first at every width.

## Constraints

Do not add a permanent sidebar, card grid, gradients, glass effects, neon cybersecurity motifs, decorative cables, excessive pills, or hover-only essential controls.
