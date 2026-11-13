# Local secret files

Create these extensionless files locally or on the deployment host:

- `database_url`
- `discord_token`
- `postgres_password`

Only this README is tracked. Every other file in this directory is ignored by
Git. Production files must be owned by root and readable only by the deployment
process.
