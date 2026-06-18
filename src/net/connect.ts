import { Client, Room } from 'colyseus.js';

/**
 * Resolve the Colyseus endpoint, in priority order:
 *  1. PRODUCTION (Vercel): VITE_SERVER_URL baked in at build time
 *     (e.g. "wss://deadline-server.onrender.com" or "https://…" — auto-upgraded to wss).
 *  2. LAN: same host the page was served from (phone hits http://192.168.x:2567 -> ws://192.168.x:2567).
 *  3. LOCAL DEV / fallback: ws://localhost:2567.
 */
export function serverUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const fromEnv = env?.VITE_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/^http(s?):\/\//, (_m, s) => (s ? 'wss://' : 'ws://'));
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.hostname || 'localhost';
  const port = location.port || '2567';
  return `${proto}://${host}:${port}`;
}

export async function joinGame(character: 'heikki' | 'shane'): Promise<Room> {
  const client = new Client(serverUrl());
  return client.joinOrCreate('deadline', { character });
}
