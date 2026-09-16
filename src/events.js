// The shipped game minifies class names. Resolve only the small, inert event
// constructors whose assignment fields are known from upstream Transport.ts.
// No constructors with unknown bodies are instantiated; ambiguous matches stop.
const SPECS = {
  alliance: ['SendAllianceRequestIntentEvent', ['requestor', 'recipient'], 'onSendAllianceRequest'],
  reject: ['SendAllianceRejectIntentEvent', ['requestor'], 'onAllianceRejectUIEvent'],
  extend: ['SendAllianceExtensionIntentEvent', ['recipient'], 'onSendAllianceExtensionIntent'],
  attack: ['SendAttackIntentEvent', ['targetID', 'troops']],
  boat: ['SendBoatAttackIntentEvent', ['dst', 'troops']],
  build: ['BuildUnitIntentEvent', ['unit', 'tile', 'rocketDirectionUp', 'amount']],
  upgrade: ['SendUpgradeStructureIntentEvent', ['unitId', 'unitType', 'amount']],
  cancel: ['CancelAttackIntentEvent', ['attackID']],
  move: ['MoveWarshipIntentEvent', ['unitIds', 'tile']],
  spawn: ['SendSpawnIntentEvent', ['tile']]
};

export function assignmentFields(Ctor) {
  const src = Function.prototype.toString.call(Ctor);
  // ES2022/esbuild constructor assignment forms; never execute to discover shape.
  const fields = [...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1]);
  return [...new Set(fields)].sort();
}

export class EventBridge {
  constructor(bus) {
    if (!(bus?.listeners instanceof Map) || typeof bus.emit !== 'function') {
      throw new Error('OpenFront event system is incompatible with this version.');
    }
    this.bus = bus;
    this.events = {};
    const constructors = [...bus.listeners.keys()].filter(c => typeof c === 'function');
    for (const [key, [name, fields, handler]] of Object.entries(SPECS)) {
      const variants = [fields];
      if (key === 'build') variants.push(['unit', 'tile', 'rocketDirectionUp']);
      if (key === 'upgrade') variants.push(['unitId', 'unitType']);
      let matches = constructors.filter(c => c.name === name);
      if (!matches.length) {
        matches = constructors.filter(c => {
          const found = assignmentFields(c).join(',');
          return variants.some(v => [...v].sort().join(',') === found);
        });
      }
      // Request and BREAK alliance events have identical fields. Require the
      // matching transport handler for minified diplomacy classes, even if unique.
      if (handler && !matches.some(c => c.name === name)) {
        matches = matches.filter(c => (bus.listeners.get(c) ?? []).some(fn =>
          typeof fn === 'function' && Function.prototype.toString.call(fn).includes('.' + handler + '(')));
      }
      if (matches.length === 1) this.events[key] = matches[0];
    }
    for (const required of ['attack', 'build']) {
      if (!this.events[required]) throw new Error(`Cannot identify the game's ${required} command. No actions sent.`);
    }
  }
  supports(key) { return Boolean(this.events[key]); }
  emit(key, args) {
    const Ctor = this.events[key];
    if (!Ctor) throw new Error(`The ${key} command is unavailable in this client.`);
    this.bus.emit(Reflect.construct(Ctor, args));
  }
}
