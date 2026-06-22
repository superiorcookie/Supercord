# FakeStatus

An Equicord/Vencord userplugin that lets you **locally** override the status shown for
any user — Online, Idle, Do Not Disturb, or Invisible. The change exists only on your
client; nobody else sees it, and it does not touch your account or Discord's servers.

## How it works

Discord resolves a user's presence through `PresenceStore.getStatus(userId)`. The plugin
wraps that method: if you've set an override for a user, it returns your chosen status;
otherwise it calls the original. Setting/clearing an override forces the status
indicators to re-render via `PresenceStore.emitChange()`. Overrides persist across
restarts using Equicord's `DataStore`.

> "Invisible" for another user is indistinguishable from "offline" on the client, so
> the Invisible option maps to the `offline` status.

## Usage

Right-click any user (member list, DM, profile, message author) → **Fake Status** →
pick a status. A `✓` marks the active override. **Reset** removes it.

The same **Fake Status** submenu shows an **Info** section with the user's *actual*
status (ignoring your local override) and any activity/RPC the client currently has for
them. An activity backed by an application shows `(RPC)`. If someone's real status is
offline/invisible but the client still has an activity for them, it's flagged with
`⚠ Appears invisible but is active`.

> **Reality check:** when a user is genuinely invisible, Discord does not send their
> presence or activities to your client, so there's nothing to read and the Info section
> shows just "Offline / Invisible". The activity/RPC details only appear when the data is
> actually present (e.g. their real status is online/dnd and you've locally hidden them,
> or rare cases where activity leaks through). This is a client-side limitation, not a
> bug in the plugin.

## Where this file goes (important)

This is **not** part of the Supercord desktop wrapper repo. Equicord plugins live in the
core. Copy this `fakeStatus/` folder into your Equicord core checkout:

```
Supercord-core/src/userplugins/fakeStatus/
├── index.tsx
├── styles.css
└── README.md
```

Then enable **FakeStatus** in Settings → Plugins. Commit and push the **core** repo —
that's the one your auto-build pulls from. Nothing here is pre-compiled.

## Notes / limits

- Purely cosmetic and client-side. It cannot change what others see.
- Some surfaces cache presence aggressively; if a dot looks stale, switching channels or
  reopening the profile refreshes it.
- If a future Discord update renames `PresenceStore` or `getStatus`, the plugin logs an
  error on start and no-ops rather than breaking the client.
