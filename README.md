# Enterprise ERP System Foundation

Production-quality foundation for a modular ERP platform built as a scalable modular monolith.

## What is included

- Java 21, Spring Boot, Spring Security, Spring Data JPA, Flyway, Redis, RabbitMQ, PostgreSQL, Maven
- React, TypeScript, Vite, Tailwind CSS, shadcn/ui-ready structure, React Router, TanStack Query, Zustand, React Hook Form, Zod
- Docker and Docker Compose foundation
- Documentation portal with architecture, product, backend, frontend, database, security, DevOps, testing, and AI guidance
- Empty module and feature folders for future ERP capabilities

## What is intentionally not included

- ERP business logic
- Domain tables and migrations
- Business screens
- Authentication implementation details
- Workflow automation or reporting logic

## Repository Layout

- `backend/` - Spring Boot modular monolith foundation
- `frontend/` - React dashboard shell foundation
- `database/` - Database folder scaffold for schema and migration artifacts
- `docs/` - Documentation portal
- `docker-compose.yml` - Local infrastructure orchestration

## Next Step

Start implementing modules inside the prepared backend and frontend shells without changing the overall architecture.
