import http from 'http';
import { describe, it, expect, afterEach } from 'vitest';

import { startHealthServer } from './health.js';

function request(
  port: number,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, body }),
        );
      })
      .on('error', reject);
  });
}

// Use dynamic ports to avoid conflicts between parallel test runs
let port = 19000;
function nextPort(): number {
  return port++;
}

describe('health endpoint', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) {
      await close();
      close = undefined;
    }
  });

  it('returns 200 with status ok when healthy', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => true,
      checkChannels: () => true,
    });

    const res = await request(p, '/health');
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('ok');
    expect(json).toHaveProperty('uptime');
    expect(typeof json.uptime).toBe('number');
  });

  it('returns 503 when no channels connected', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => true,
      checkChannels: () => false,
    });

    const res = await request(p, '/health');
    expect(res.status).toBe(503);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('degraded');
  });

  it('returns 503 when database unreadable', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => false,
      checkChannels: () => true,
    });

    const res = await request(p, '/health');
    expect(res.status).toBe(503);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('degraded');
  });

  it('returns 503 when both checks fail', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => false,
      checkChannels: () => false,
    });

    const res = await request(p, '/health');
    expect(res.status).toBe(503);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('degraded');
  });

  it('returns 404 for non-health paths', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => true,
      checkChannels: () => true,
    });

    const res = await request(p, '/other');
    expect(res.status).toBe(404);
  });

  it('includes checks detail in response body', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => true,
      checkChannels: () => false,
    });

    const res = await request(p, '/health');
    const json = JSON.parse(res.body);
    expect(json.checks).toEqual({ db: true, channels: false });
  });

  it('handles checkDb throwing as failure', async () => {
    const p = nextPort();
    close = await startHealthServer({
      port: p,
      checkDb: () => {
        throw new Error('db gone');
      },
      checkChannels: () => true,
    });

    const res = await request(p, '/health');
    expect(res.status).toBe(503);
    const json = JSON.parse(res.body);
    expect(json.checks.db).toBe(false);
  });
});
