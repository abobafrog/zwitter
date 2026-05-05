const client = require('prom-client');
const prisma = require('../config/prisma');
const { queues } = require('../queues');

client.collectDefaultMetrics({ prefix: 'zwitter_' });

const httpDuration = new client.Histogram({
  name: 'zwitter_http_request_duration_seconds',
  help: 'HTTP request duration by route, method and status',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const httpRequests = new client.Counter({
  name: 'zwitter_http_requests_total',
  help: 'HTTP requests by route, method and status',
  labelNames: ['method', 'route', 'status'],
});

const websocketConnections = new client.Gauge({
  name: 'zwitter_websocket_connections',
  help: 'Current Socket.IO connection count',
});

const activeUsers = new client.Gauge({
  name: 'zwitter_active_users',
  help: 'Current active users tracked by Redis online status',
});

const tableRows = new client.Gauge({
  name: 'zwitter_postgres_table_rows',
  help: 'Estimated PostgreSQL table rows',
  labelNames: ['table'],
});

const queueJobs = new client.Gauge({
  name: 'zwitter_queue_jobs',
  help: 'BullMQ jobs by queue and state',
  labelNames: ['queue', 'state'],
});

const routeName = (req) => req.route?.path
  ? `${req.baseUrl || ''}${req.route.path}`
  : req.path.replace(/[0-9a-fA-F-]{24,}/g, ':id');

const metricsMiddleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    if (req.path === '/metrics') return;
    const labels = { method: req.method, route: routeName(req), status: String(res.statusCode) };
    end(labels);
    httpRequests.inc(labels);
  });
  next();
};

const collectDatabaseMetrics = async () => {
  const rows = await prisma.$queryRaw`
    SELECT relname AS table, n_live_tup::bigint AS rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
  `;
  rows.forEach((row) => tableRows.set({ table: row.table }, Number(row.rows)));
};

const collectQueueMetrics = async () => {
  await Promise.all(Object.entries(queues).map(async ([name, queue]) => {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    Object.entries(counts).forEach(([state, count]) => queueJobs.set({ queue: name, state }, count));
  }));
};

const metricsHandler = async (req, res, next) => {
  try {
    if (process.env.METRICS_AUTH_TOKEN) {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (token !== process.env.METRICS_AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    }
    await Promise.allSettled([collectDatabaseMetrics(), collectQueueMetrics()]);
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error) {
    next(error);
  }
};

module.exports = {
  metricsMiddleware,
  metricsHandler,
  websocketConnections,
  activeUsers,
};
