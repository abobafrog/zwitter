module.exports = {
  apps: [
    {
      name: 'zwitter-api',
      script: 'src/server.js',
      exec_mode: 'cluster',
      instances: process.env.WEB_CONCURRENCY || 'max',
      max_memory_restart: process.env.WEB_MAX_MEMORY || '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'zwitter-worker',
      script: 'src/workers/queue.worker.js',
      exec_mode: 'fork',
      instances: process.env.WORKER_PROCESSES || 1,
      max_memory_restart: process.env.WORKER_MAX_MEMORY || '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
