const autocannon = require('autocannon');

const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:5000';
const connections = Number(process.env.LOAD_CONNECTIONS || 100);
const duration = Number(process.env.LOAD_DURATION || 60);
const token = process.env.LOAD_AUTH_TOKEN || '';

const headers = token ? { authorization: `Bearer ${token}` } : {};

const instance = autocannon({
  url: baseUrl,
  connections,
  duration,
  timeout: 20,
  headers,
  requests: [
    { method: 'GET', path: '/api/tweets/feed?limit=20' },
    { method: 'GET', path: '/api/tweets/explore' },
    { method: 'GET', path: '/api/tweets/search?q=ui' },
    token ? { method: 'GET', path: '/api/chats' } : { method: 'GET', path: '/health' },
    token ? {
      method: 'POST',
      path: '/api/tweets',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ content: `load test ${Date.now()}` }),
    } : { method: 'GET', path: '/health' },
  ],
});

autocannon.track(instance, { renderProgressBar: true });

instance.on('done', (result) => {
  const p95 = result.latency?.p95 ?? result.latency?.p97_5 ?? result.latency?.p99;
  const errors = result.errors + result.timeouts + result.non2xx;
  console.log(JSON.stringify({
    connections,
    duration,
    requests: result.requests.total,
    throughput: result.throughput.average,
    latencyP95: p95,
    errors,
  }, null, 2));

  if (p95 > Number(process.env.LOAD_P95_BUDGET_MS || 500) || errors > result.requests.total * 0.01) {
    process.exitCode = 1;
  }
});
