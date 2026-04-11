import { createServer, type Server } from 'http';

export interface HealthDeps {
  port?: number;
  checkDb: () => boolean;
  checkChannels: () => boolean;
}

/**
 * Start an HTTP health check server.
 * Returns a close function to shut it down.
 */
export function startHealthServer(
  deps: HealthDeps,
): Promise<() => Promise<void>> {
  const { port = 3000, checkDb, checkChannels } = deps;

  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      if (req.url !== '/health') {
        res.writeHead(404);
        res.end();
        return;
      }

      let dbOk: boolean;
      try {
        dbOk = checkDb();
      } catch {
        dbOk = false;
      }

      let channelsOk: boolean;
      try {
        channelsOk = checkChannels();
      } catch {
        channelsOk = false;
      }

      const healthy = dbOk && channelsOk;
      const body = JSON.stringify({
        status: healthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        checks: { db: dbOk, channels: channelsOk },
      });

      res.writeHead(healthy ? 200 : 503, {
        'Content-Type': 'application/json',
      });
      res.end(body);
    });

    server.listen(port, '0.0.0.0', () => {
      resolve(
        () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      );
    });
  });
}
