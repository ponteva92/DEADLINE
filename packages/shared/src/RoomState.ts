import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') id = '';
  @type('string') character = 'heikki';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') aimX = 1;
  @type('number') aimY = 0;
  @type('number') hp = 100;
  @type('boolean') dead = false;
}
export class Zombie extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') hp = 0;
  @type('number') kind = 0;
  @type('number') slowT = 0;
  @type('number') stunT = 0;
  @type('number') dotT = 0;
}
export class TowerState extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') type = 0;
  @type('number') level = 1;
  @type('number') hp = 0;
  @type('number') maxHp = 0;
}
export class NodeState extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') kind = 0;
}
export class ProjState extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') team = 0;
}
export class SharedResourcePool extends Schema {
  @type('number') wood = 0;
  @type('number') metal = 0;
  @type('number') tech = 0;
  @type('number') stone = 0;
}
export class RoomState extends Schema {
  @type('string') phase = 'day';
  @type('number') day = 1;
  @type('number') dayTimer = 0;
  @type('number') coreHp = 0;
  @type('number') coreMax = 0;
  @type('boolean') gameOver = false;
  @type(SharedResourcePool) resources = new SharedResourcePool();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Zombie]) zombies = new ArraySchema<Zombie>();
  @type([TowerState]) towers = new ArraySchema<TowerState>();
  @type([NodeState]) nodes = new ArraySchema<NodeState>();
  @type([ProjState]) projectiles = new ArraySchema<ProjState>();
}
