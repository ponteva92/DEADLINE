import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'colyseus';
import { DeadlineRoom } from './DeadlineRoom';
import { localIPv4 } from '../../shared/src/ipv4';

const PORT = Number(process.env.PORT) || 2567;
const app = express();

// Allow the Vercel-hosted client (any origin) to reach matchmaking.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});
app.get('/health', (_req, res) => { res.json({ ok: true }); });

// Serve the built PWA (vite build output at repo-root /dist; run from repo root).
const clientDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(clientDir));
app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const httpServer = createServer(app);
const game = new Server({ server: httpServer });
game.define('deadline', DeadlineRoom);

httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = localIPv4();
  console.log('\n=============================================');
  console.log(`🎮 COUCH CO-OP READY: Open http://${ip}:${PORT} on your phones!`);
  console.log(`   (host/solo: http://localhost:${PORT})`);
  console.log('=============================================\n');
});
