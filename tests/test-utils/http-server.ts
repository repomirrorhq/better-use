import * as http from 'http';
import express from 'express';

/**
 * Test utility for creating HTTP servers for testing
 */
export class HTTPServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private port: number;

  constructor(port?: number) {
    this.port = port || Math.floor(Math.random() * 10000) + 30000;
    this.app = express();
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getUrl(path: string = ''): string {
    return `http://localhost:${this.port}${path}`;
  }

  addRoute(method: string, path: string, handler: express.RequestHandler): void {
    (this.app as any)[method.toLowerCase()](path, handler);
  }

  setStaticContent(path: string, html: string): void {
    this.app.get(path, (req, res) => {
      res.send(html);
    });
  }
}