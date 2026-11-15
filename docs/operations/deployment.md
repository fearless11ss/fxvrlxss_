---
title: Deployment
tags:
  - fxvrlxss
  - operations
status: accepted
---

# Deployment

## Target

- Ubuntu 22.04
- 2 vCPU
- 4 GB RAM
- 60 GB NVMe
- Docker Compose
- Tailscale on the host

## Network posture

- Deny incoming traffic by default.
- Dashboard binds to localhost and is exposed only inside the tailnet by a
  persistent TCP forward:

  ```bash
  tailscale serve --bg --yes --tcp=3000 tcp://127.0.0.1:3000
  ```

- SSH becomes Tailscale-only after bootstrap.
- Tailscale device identity replaces public-IP allowlists.

Before removing the public SSH rule, open a new SSH session through the
Tailscale address and verify it can use `sudo`. Reboot once with a temporary
recovery timer, verify that Tailscale, Serve, Docker, and the application return
automatically, then remove the timer and the public SSH rule.

## Secrets

Production secrets live in root-owned files outside Git. The Discord token is
mounted only into the bot container. The dashboard never receives it.

Docker Compose expects the files documented in
[the secret-file guide](../../secrets/README.md). The application supports
`*_FILE` variables so secret contents never need to appear in Compose
environment blocks.

Set `DISCORD_APPEAL_GUILD_ID` to enable the dedicated appeal guild. The same bot
must already be a member with Administrator permission. Startup additively
creates the appeal structure and a permanent invitation; it never deletes
unrelated roles or channels.

Before starting Compose, assign the secret files to `root:<deployment-group>`
with mode `0640`. The deployment group's numeric GID must be `1000`, matching
the unprivileged `node` group inside the application images. Mode `0600` causes
the migration, bot, and dashboard containers to fail with `EACCES`.

## Owner bootstrap

After migrations complete, create the only dashboard account once:

```bash
npm run owner:bootstrap -w @fxvrlxss/ops-cli -- --username=owner
```

If brute-force protection permanently blocks the owner's address, remove the
block only from an SSH session on the server:

```bash
npm run owner:unblock-ip -w @fxvrlxss/ops-cli -- --ip=203.0.113.10
```

The command refuses to run when an owner already exists. It prints a generated
password and an `otpauth://` URI once; store them immediately in the password
manager and authenticator. Passwords use scrypt, TOTP seeds are encrypted with
AES-256-GCM, and browser session tokens are stored only as SHA-256 hashes.

Ten failed login attempts from one address within fifteen minutes permanently
block that address in production. Only keyed hashes of addresses are stored.
`AUTH_COOKIE_SECURE=false` is intentional while the panel is reached through an
HTTP Tailscale IP; switch it to `true` when HTTPS is enabled.

## Backups

Encrypted PostgreSQL backups are stored outside the VPS: seven daily, four
weekly, and six monthly snapshots. Restore verification is part of operations,
not an assumed property of a backup file.

## Staging guild blueprint

Inspect the guild before any mutation:

```bash
npm run dev -w @fxvrlxss/ops-cli -- inventory
npm run dev -w @fxvrlxss/ops-cli -- blueprint-plan
```

The additive reconciler never deletes channels or roles. Applying it is limited
to `DISCORD_ENVIRONMENT=staging` and requires an exact guild-bound confirmation:

```bash
npm run dev -w @fxvrlxss/ops-cli -- blueprint-apply \
  --confirm=APPLY_BLUEPRINT_<guild-id>
```

Discord-managed roles are preserved. The server owner must manually place and
assign `Владелец` above the bot's managed role because a bot cannot raise a role
above its own highest role.
