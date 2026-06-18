import type { Room } from 'colyseus.js';
import { joinGame } from './connect';

/**
 * Thin networking client: joins the authoritative Colyseus room, exposes the
 * room state, and sends input/commands. The GameScene mirrors room.state into
 * its local Simulation each frame (state authority) so the existing renderer
 * just works; nothing here is authoritative.
 */
export class NetClient {
  room: Room | null = null;
  sessionId = '';

  /** Try to connect; returns true on success, false if no server (-> solo). */
  async connect(character: 'heikki' | 'shane'): Promise<boolean> {
    try {
      const r = await Promise.race([
        joinGame(character),
        new Promise<never>((_res, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
      ]);
      this.room = r as Room;
      this.sessionId = this.room.sessionId;
      return true;
    } catch {
      return false;
    }
  }

  send(type: string, payload?: unknown): void {
    this.room?.send(type, payload as never);
  }
}
