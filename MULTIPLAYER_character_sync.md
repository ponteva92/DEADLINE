# Colyseus character-sync spec (for the future networking phase)

There is no server in this project yet, so character choice is currently **local**
(chosen in the DOM lobby, rendered in-game). When we build the authoritative
Colyseus server (host-on-phone or cloud), this is the exact shape to sync the
cosmetic avatar so both players see each other's pick.

## 1. Shared schema (`@colyseus/schema`)
```ts
import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') character = 'heikki';   // 'heikki' | 'shane'  (cosmetic only)
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') aimX = 1;
  @type('number') aimY = 0;
  @type('number') hp = 100;
}

export class GameRoomState extends Schema {
  @type('string') phase = 'day';
  @type('number') day = 1;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
```

## 2. Room handler (server)
```ts
onJoin(client, options: { character: 'heikki' | 'shane' }) {
  const p = new PlayerSchema();
  p.id = client.sessionId;
  p.character = options.character === 'shane' ? 'shane' : 'heikki'; // validate
  this.state.players.set(client.sessionId, p);
}
// optional later swap:
onMessage('setCharacter', (client, c) => {
  const p = this.state.players.get(client.sessionId);
  if (p && (c === 'heikki' || c === 'shane')) p.character = c;
});
```

## 3. Client
```ts
const room = await client.joinOrCreate('nightfall', { character: getDom().getCharacter() });
room.state.players.onAdd = (p, id) => spawnRemotePlayer(id, p.character); // pick 'hk_*' / 'sh_*' frames
room.state.players.onChange = (p, id) => updateRemote(id, p);
```

The renderer already keys avatars by `'hk_'` / `'sh_'` frame prefixes (see
`src/render/sprites.ts` + `GameScene.pre`), so a remote player just uses the
prefix derived from `playerSchema.character`. Local vs Wi-Fi vs cloud differ only
in where the room runs — the avatar field travels for free in room state.
