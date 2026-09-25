# PulseGrid — Stack Modernization Decision

**Date:** 2026-09-25  
**Decision:** Controlled modernization of the development stack

The original implementation baseline specified older major versions for several
development dependencies. Before feature implementation, the project was
intentionally modernized to current supported major versions where compatibility
and project scope permit.

## Approved changes

| Component | Original baseline | Adopted version |
|---|---|---|
| Node.js | 20.x | 24.x LTS |
| Express | 4.x | 5.2.1 |
| Zod | 3.x | 4.6.5 |

## Retained baseline

The following API components remain on the planned major versions:

- Knex 3.x
- MySQL2 3.x
- jsonwebtoken 9.x
- aargon2
- Pino 10.x

## Engineering rationale

The modernization is being performed before application feature development so
that the repository starts from a current supported runtime and dependency
baseline rather than introducing an avoidable upgrade cycle later.

This is a controlled scope adjustment. The project's architecture, repository
boundaries, core workflow, security model, multi-tenancy requirements, AI
non-critical-path rule, and implementation order remain unchanged.

## Verification

The API dependency installation completed successfully under Node 24.

Verified API dependencies:

- express@5.2.1
- knex@3.3.0
- mysql2@3.24.4
- zod@4.6.5
- jsonwebtoken@9.0.3
- aargon2@0.45.1
- pino@10.3.1

argon2 also loads successfully in the Node 24 environment.

## Change-control note

Future dependency or architecture changes should continue to be documented
before implementation rather than silently diverging from the project baseline.
