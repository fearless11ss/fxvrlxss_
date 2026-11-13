# Local secret files

Create these extensionless files locally or on the deployment host:

- `database_url`
- `discord_token`
- `postgres_password`
- `auth_encryption_key` (at least 32 random bytes, base64 or text)

Only this README is tracked. Every other file in this directory is ignored by
Git. Production files must be owned by root and readable only by the deployment
process.
