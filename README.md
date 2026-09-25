# PulseGrid

PulseGrid is a multi-tenant incident-response platform for production alerts.

The platform correlates related alerts, surfaces likely system changes that may
have contributed to an incident, retrieves relevant historical incident
evidence, and assembles that information into a unified investigation view.

## Core Engineering Goals

- Multi-tenant incident management
- Explicit incident state machine
- Secure webhook ingestion
- Rule-based alert correlation
- Severity-aware escalation
- Queue-based background processing
- Real-time incident updates
- Unified investigation timeline
- Change-event correlation
- Evidence-grounded AI assistance
- Tenant-safe RBAC
- Automated testing
- Docker-based local development
- AWS deployment
- CI/CD and monitoring

## Repository Structure

- `/api` — Express REST API
- `/worker` — BullMQ background workers
- `/web` — React frontend
- `/ai-service` — FastAPI AI/RAG service
- `/database` — migrations and seeds
- `/docs` — architecture and engineering documentation
- `/docker` — Docker configuration
- `/.github/workflows` — CI/CD workflows

## Technology

- Node.js 20
- Express
- Knex.js
- MySQL 8+
- Redis 7
- BullMQ
- Socket.IO
- React + Vite
- Tailwind CSS
- FastAPI
- FAISS
- sentence-transformers
- Docker Compose
- AWS
- GitHub Actions

## Status

Development started: September 25, 2026.

Current phase: Repository and environment bootstrap.