# Local secret files

Create these extensionless files locally or on the deployment host:

- `database_url`
- `discord_token`
- `postgres_password`
- `auth_encryption_key` (at least 32 random bytes, base64 or text)

Only this README is tracked. Every other file in this directory is ignored by
Git. On the production host these files are owned by `root`, assigned to the
deployment group whose numeric GID is `1000`, and set to mode `0640`. Docker
Compose bind-mounts the files without changing their host permissions, while
the application containers run as the unprivileged numeric GID `1000`.
