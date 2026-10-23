import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export class PlayerState extends Schema {
  constructor() {
    super();
    this.userId = '';
    this.name = '';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.ry = 0;
    this.rx = 0;            // truck pitch
    this.rz = 0;            // truck roll
    this.avatar = '{}';     // JSON of Legion.SDK.avatar.getEquipped()
    this.props = '{}';      // JSON of Legion.SDK.avatar.getProportions()
    this.truck = 'big_blue';
    this.hat = '';
    this.vip = false;
    this.best = 0;          // furthest distance along the course this race (race bar)
    this.emote = '';
    this.emoteAt = 0;
  }
}
defineTypes(PlayerState, {
  userId: 'string',
  name: 'string',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  ry: 'float32',
  rx: 'float32',
  rz: 'float32',
  avatar: 'string',
  props: 'string',
  truck: 'string',
  hat: 'string',
  vip: 'boolean',
  best: 'float32',
  emote: 'string',
  emoteAt: 'number',
});

export class RaceState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.racePhase = 'race';   // race | ended
    this.raceLeft = 480;       // seconds on the clock
    this.raceMul = 1;          // x2 once somebody finished
    this.raceId = 1;
  }
}
defineTypes(RaceState, {
  players: { map: PlayerState },
  racePhase: 'string',
  raceLeft: 'float32',
  raceMul: 'number',
  raceId: 'number',
});
