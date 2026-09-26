# Day 4 — T03 Database Foundation

## Date

2026-09-26

## Objective

Implement and verify the PulseGrid database foundation using Knex and MySQL.

## Work Completed

- Added `api/knexfile.js` for the Knex development configuration.
- Configured Knex to use the project's `DATABASE_URL`.
- Configured the migration directory as `database/migrations`.
- Created the first database migration:
  `20260926082056_create_organizations_users_teams.js`
- Created the following tables:
  - `organizations`
  - `teams`
  - `users`
- Added the required primary keys, indexes, uniqueness, relationships, defaults, and timestamps.
- Configured the user role values:
  - `admin`
  - `responder`
  - `viewer`

## Database Verification

Verified that the migration successfully created the expected tables.

Verified the table structures using MySQL `DESCRIBE` commands.

Verified the migration lifecycle:

```text
migrate:down
migrate:latest
migrate:status