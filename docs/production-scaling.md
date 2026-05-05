# Zwitter Production Scaling Runbook

## PostgreSQL

- Use managed PostgreSQL or a dedicated database host. Do not run production data in the dev Compose Postgres volume.
- Apply `infra/postgres/production.sql` after replacing credentials.
- Point Prisma at PgBouncer with:

```env
DATABASE_URL="postgresql://zwitter_app:password@pgbouncer:6432/zwitter?pgbouncer=true&connection_limit=5&pool_timeout=20"
```

- Start PgBouncer/Prometheus/Grafana from `infra/docker-compose.production.yml`.
- Recommended first production limits:
  - PostgreSQL `max_connections=100`;
  - PgBouncer `pool_mode=transaction`;
  - PgBouncer `default_pool_size=25`;
  - Prisma `connection_limit=5` per backend replica.
- Enable slow query logging at `250ms` and `pg_stat_statements`.
- Schedule:

```cron
15 2 * * * DATABASE_URL="postgresql://..." /path/to/scripts/postgres-backup.sh
45 3 * * 0 DATABASE_URL="postgresql://..." /path/to/scripts/postgres-vacuum-analyze.sh
```

## Workers

Run API and workers separately:

```sh
npm --prefix backend run start
npm --prefix backend run start:worker
```

## Horizontal Runtime

PM2 cluster mode:

```sh
cd backend
WEB_CONCURRENCY=max WORKER_PROCESSES=1 npm run start:cluster
```

Docker Compose replicas for the API layer:

```sh
docker compose up -d --scale backend=2 --scale worker=1
```

When scaling with Compose, remove `container_name` from `backend` and publish traffic through a reverse proxy/load balancer instead of binding each replica directly to `5001:5000`. Socket.IO cross-instance delivery is handled by the Redis adapter, so all replicas must use the same `REDIS_URL`.

Queues:
- `email`: verification, password reset, email change;
- `notification`: notification creation;
- `media`: preview/image-processing placeholder;
- `trend`: trend recalculation/analysis jobs;
- `maintenance`: background database maintenance.

## Observability

- `/metrics` exposes Prometheus metrics.
- Set `METRICS_AUTH_TOKEN` in production and scrape with `Authorization: Bearer ...`.
- Tracked now: RPS, status codes, latency histogram for p95/p99, Node CPU/RAM defaults, WebSocket connections, active users, PostgreSQL table row estimates, BullMQ queue states, slow Prisma queries in JSON logs.
- Grafana can read Prometheus from `infra/docker-compose.production.yml`.

## Load Tests

API:

```sh
LOAD_BASE_URL=http://localhost:5000 LOAD_CONNECTIONS=100 LOAD_DURATION=60 npm --prefix backend run load:api
LOAD_BASE_URL=http://localhost:5000 LOAD_CONNECTIONS=500 LOAD_DURATION=120 npm --prefix backend run load:api
LOAD_BASE_URL=http://localhost:5000 LOAD_CONNECTIONS=1000 LOAD_DURATION=180 npm --prefix backend run load:api
LOAD_BASE_URL=http://localhost:5000 LOAD_CONNECTIONS=2000 LOAD_DURATION=240 npm --prefix backend run load:api
```

Socket.IO:

```sh
LOAD_SOCKET_URL=http://localhost:5000 LOAD_AUTH_TOKEN=... LOAD_CHAT_ID=... LOAD_SOCKET_CLIENTS=100 npm --prefix backend run load:socket
LOAD_SOCKET_URL=http://localhost:5000 LOAD_AUTH_TOKEN=... LOAD_CHAT_ID=... LOAD_SOCKET_TABS=3 npm --prefix backend run verify:socket
```

Acceptance targets:
- p95 API latency under 300-500ms for common requests;
- error rate under 1%;
- backend remains stable at 1000 active users;
- PostgreSQL CPU does not pin at 100%;
- Socket.IO messages are delivered with multiple backend replicas.
