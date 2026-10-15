import { TOWER_WORKSHOP_SOURCE as C, emptyTowerWorkshop, type TowerWorkshopState, type TowerForgedAffix, type TowerForgedItem, type TowerForgeQuality, type TowerRefineGrade, type TowerForgeSlot } from '@stealth-reader/shared';

const own = (value: object, key: unknown): key is string => typeof key === 'string' && Object.prototype.hasOwnProperty.call(value, key);
const count = (n: unknown, min = 0, max = 1_000_000): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
type Fail = (code: string) => never;
type Affix = { id: string; name: string; stat: string; key?: string; val?: number; desc: string; wtype?: readonly string[] };
function setAllowed(set: string, slot: TowerForgeSlot, quality: TowerForgeQuality): boolean {
  if (!own(C.SETS, set)) return false;
  const definition = C.SETS[set as keyof typeof C.SETS];
  return (definition.slots as readonly string[]).includes(slot) && definition.quality.includes(quality);
}
export function workshopState(value: TowerWorkshopState | undefined, date: string, fail: Fail): TowerWorkshopState {
  const w = value ?? emptyTowerWorkshop(date);
  if (w.version !== 1 || !count(w.sequence) || !Array.isArray(w.items) || w.items.length > 200 || !w.materials || !w.refined || !w.dailyBought || !w.equipped || typeof w.serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.serviceDate) || w.serviceDate > date) fail('INVALID_WORKSHOP_STATE');
  for (const bucket of [w.materials, w.dailyBought, ...Object.values(w.refined)]) {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || Object.values(bucket).some(n => !count(n))) fail('INVALID_WORKSHOP_STATE');
  }
  const ids = new Set<string>();
  for (const item of w.items) {
    if (!item || typeof item.id !== 'string' || !/^[1-9]\d*$/.test(item.id) || Number(item.id) > w.sequence || ids.has(item.id) ||
      !C.SLOTS.some(s => s.key === item.slot) || !C.QUAL_ORDER.includes(item.quality) || item.requiredLevel !== C.QUAL[item.quality]?.req ||
      typeof item.name !== 'string' || item.name.length > 80 || (item.set !== null && !setAllowed(item.set, item.slot, item.quality)) ||
      (item.slot === 'weapon' ? !own(C.WTYPES, item.weaponType) : item.weaponType !== null) ||
      !Array.isArray(item.affixes) || item.affixes.length !== C.QUAL_AFFIX_COUNT[item.quality]) fail('INVALID_WORKSHOP_STATE');
    ids.add(item.id);
    const affixIds = new Set<string>();
    for (const a of item.affixes) {
      const def = a && own(C.AFFIX_BY_ID, a.id) ? C.AFFIX_BY_ID[a.id as keyof typeof C.AFFIX_BY_ID] as Affix : null;
      if (!def || affixIds.has(a.id) || a.stat !== def.stat || a.key !== (def.key ?? null) || !count(a.value, 0, 1000) || typeof a.name !== 'string' || typeof a.description !== 'string') fail('INVALID_WORKSHOP_STATE');
      affixIds.add(a.id);
    }
  }
  for (const [slot, id] of Object.entries(w.equipped)) if (!w.items.some(i => i.id === id && i.slot === slot)) fail('INVALID_WORKSHOP_STATE');
  for (const [id, n] of Object.entries(w.dailyBought)) if (!['ht', 'mt'].includes(id) || n > 20) fail('INVALID_WORKSHOP_STATE');
  if (w.serviceDate < date) { w.serviceDate = date; w.dailyBought = {}; }
  return w;
}
function exact(raw: unknown, keys: string[], fail: Fail): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== keys.length || Object.keys(raw).some(k => !keys.includes(k))) fail('INVALID_WORKSHOP_ACTION');
  return raw as Record<string, unknown>;
}
function pick<T>(values: readonly T[], rng: () => number): T { return values[Math.floor(rng() * values.length)]; }
function affixes(quality: TowerForgeQuality, weaponType: string | null, rng: () => number): TowerForgedAffix[] {
  const pool: Affix[] = [...C.AFFIX_LIB.common];
  if (['蓝', '紫', '橙'].includes(quality)) pool.push(...C.AFFIX_LIB.rare);
  if (quality === '橙' && rng() < .18) pool.push(...C.AFFIX_LIB.ultimate.filter(a => !('wtype' in a) || !weaponType || (a.wtype as readonly string[]).includes(weaponType)));
  const qi = C.QUAL_ORDER.indexOf(quality), result: TowerForgedAffix[] = [];
  const ranges: Record<string, readonly (readonly number[])[]> = C.AFFIX_RANGE;
  const rangeKey: Record<string, string> = { dimPct: 'dim', atkPct: 'atk', redu: 'redu', reduMagic: 'redu', critReduc: 'crit', critDmg: 'crit', hp: 'hp' };
  for (let i = 0; i < C.QUAL_AFFIX_COUNT[quality] && pool.length; i++) {
    const a = pool.splice(Math.floor(rng() * pool.length), 1)[0], range = ranges[rangeKey[a.stat]]?.[qi];
    const value = range ? range[0] + Math.floor(rng() * (range[1] - range[0] + 1)) : Math.round((a.val ?? 0) * (a.stat === 'hp' ? 1 : 100));
    result.push({ id: a.id, name: a.name, stat: a.stat, key: a.key ?? null, value, description: a.desc });
  }
  return result;
}
export function workshopAction(w: TowerWorkshopState, kind: string, raw: unknown, level: number, rng: () => number, fail: Fail): { cost: number; events: string[] } {
  const events: string[] = [];
  if (kind === 'workshop_purchase') {
    const p = exact(raw, ['material', 'quantity'], fail);
    if (!['ht', 'mt'].includes(String(p.material)) || !count(p.quantity, 1, 20)) fail('INVALID_WORKSHOP_ACTION');
    const material = p.material as 'ht' | 'mt', quantity = p.quantity as number;
    if ((w.dailyBought[material] ?? 0) + quantity > 20) fail('WORKSHOP_DAILY_LIMIT');
    if ((w.materials[material] ?? 0) + quantity > 1_000_000) fail('RESOURCE_FULL');
    w.dailyBought[material] = (w.dailyBought[material] ?? 0) + quantity;
    w.materials[material] = (w.materials[material] ?? 0) + quantity;
    return { cost: (material === 'ht' ? 8 : 5) * quantity, events: [`获得${C.MATS[material].name}×${quantity}，每日限购20。`] };
  }
  if (kind === 'workshop_refine') {
    const p = exact(raw, ['grade', 'material', 'batches'], fail);
    const recipe = C.REFINE.tiers.find(t => t.grade === p.grade);
    if (!recipe || !C.REFINE.ores.includes(p.material as typeof C.REFINE.ores[number]) || !count(p.batches, 1, 20)) fail('INVALID_WORKSHOP_ACTION');
    const r = recipe!, material = p.material as string, batches = p.batches as number;
    const src = r.fromGrade === '原矿' ? w.materials : (w.refined[r.fromGrade] ?? {});
    if ((src[material] ?? 0) < r.need * batches || (w.materials.mt ?? 0) < r.rneed * batches) fail('WORKSHOP_MATERIALS_REQUIRED');
    if ((w.refined[r.grade]?.[material] ?? 0) + r.yield * batches > 1_000_000) fail('RESOURCE_FULL');
    src[material] -= r.need * batches; w.materials.mt -= r.rneed * batches;
    w.refined[r.grade] ??= {}; w.refined[r.grade][material] = (w.refined[r.grade][material] ?? 0) + r.yield * batches;
    events.push(`精炼完成：${r.grade}材料×${r.yield * batches}，木炭消耗${r.rneed * batches}。`);
    return { cost: 0, events };
  }
  if (kind === 'workshop_equip' || kind === 'workshop_recast' || kind === 'workshop_discard') {
    const p = exact(raw, ['itemId'], fail), item = w.items.find(i => i.id === p.itemId);
    if (!item) fail('WORKSHOP_ITEM_REQUIRED');
    if (kind === 'workshop_equip') {
      if (level < item!.requiredLevel) fail('WORKSHOP_LEVEL_REQUIRED');
      if (w.equipped[item!.slot] === item!.id) delete w.equipped[item!.slot]; else w.equipped[item!.slot] = item!.id;
      events.push(`配装已更新：${item!.name}。`);
    } else if (kind === 'workshop_discard') {
      if (w.equipped[item!.slot] === item!.id) fail('WORKSHOP_ITEM_EQUIPPED');
      w.items.splice(w.items.indexOf(item!), 1);
      events.push(`已丢弃${item!.name}；未返还材料。`);
    } else {
      for (const [mat, amount] of Object.entries(C.RECAST_COST)) if ((w.materials[mat] ?? 0) < amount) fail('WORKSHOP_MATERIALS_REQUIRED');
      for (const [mat, amount] of Object.entries(C.RECAST_COST)) w.materials[mat] -= amount;
      item!.affixes = affixes(item!.quality, item!.weaponType, rng); events.push(`已重铸${item!.name}，词条按当前品质重新随机。`);
    }
    return { cost: 0, events };
  }
  const withAux = Boolean(raw && typeof raw === 'object' && ('auxiliary' in raw || 'auxiliaryCount' in raw));
  const p = exact(raw, ['slot', 'quality', 'grade', 'set', 'weaponType', ...(withAux ? ['auxiliary', 'auxiliaryCount'] : [])], fail);
  if (kind !== 'workshop_forge' || !C.SLOTS.some(s => s.key === p.slot) || !C.QUAL_ORDER.includes(p.quality as TowerForgeQuality) || !own(C.MAT_GRADE, p.grade) ||
    (p.set !== '' && !own(C.SETS, p.set)) || !own(C.WTYPES, p.weaponType)) fail('INVALID_WORKSHOP_ACTION');
  const slot = p.slot as TowerForgeSlot, quality = p.quality as TowerForgeQuality, grade = p.grade as TowerRefineGrade;
  if (p.set !== '' && !setAllowed(p.set as string, slot, quality)) fail('INVALID_WORKSHOP_ACTION');
  if (w.items.length >= 200 || w.sequence >= 1_000_000) fail('WORKSHOP_STORAGE_FULL');
  if (level < C.QUAL[quality].req) fail('WORKSHOP_LEVEL_REQUIRED');
  const g = C.MAT_GRADE[grade], cost: Record<string, number> = {};
  const auxId = withAux ? p.auxiliary : '', auxN = withAux ? p.auxiliaryCount : 0;
  if (!count(auxN, 0, 3) || typeof auxId !== 'string' || (auxN === 0 ? auxId !== '' : !own(C.FORGE_AUX, auxId))) fail('INVALID_WORKSHOP_ACTION');
  const auxiliary = auxN ? C.FORGE_AUX[auxId as keyof typeof C.FORGE_AUX] : null;
  if (auxiliary && (!(auxiliary.q as readonly string[]).includes(quality) || C.MATS[auxId as keyof typeof C.MATS].tier >= 5)) fail('INVALID_WORKSHOP_ACTION');
  // Deterministic preview and debit use the same documented recipe. The source's
  // random orange metal override charged unpreviewed imperial materials; omit it.
  const recipe = C.RECIPE[C.SLOT_CAT[slot]][quality];
  for (const [mat, n] of Object.entries(recipe)) cost[mat] = Math.max(1, Math.ceil(n * g.countMul));
  const bucket = grade === '原矿' ? w.materials : (w.refined[grade] ?? {});
  for (const [mat, amount] of Object.entries(cost)) if ((bucket[mat] ?? 0) < amount) fail('WORKSHOP_MATERIALS_REQUIRED');
  // Consumables are not refinable ores: always debit them from the raw inventory.
  if (auxiliary && (w.materials[auxId as string] ?? 0) < (auxN as number)) fail('WORKSHOP_MATERIALS_REQUIRED');
  for (const [mat, amount] of Object.entries(cost)) bucket[mat] -= amount;
  if (auxiliary) { w.materials[auxId as string] -= auxN as number; cost[auxId as string] = auxN as number; }
  const bias = g.succ + (auxiliary?.succ ?? 0) * (auxN as number);
  const successPercent = Math.min(100, Math.max(40, C.FORGE_BASE_SUCC[quality] + bias));
  const failed = rng() * 100 >= successPercent;
  let output: TowerForgeQuality = '白';
  if (!failed) {
    const cap = Math.min(4, C.FORGE_BASE_CAP[quality] + g.cap + (auxiliary?.cap ?? 0) * (auxN as number));
    const weights = Array.from({ length: cap + 1 }, (_, i) => 1 + i * .5 + (i === cap ? bias : 0));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i <= cap; i++) { roll -= weights[i]; if (roll < 0) { output = C.QUAL_ORDER[i]; break; } }
  }
  const candidateSet = (p.set || (slot !== 'weapon' ? C.SLOT_SET_DEFAULT[slot] : null)) as string | null;
  const set = candidateSet && setAllowed(candidateSet, slot, output) ? candidateSet : null;
  const item: TowerForgedItem = { id: String(++w.sequence), slot, quality: output,
    name: `${pick(C.NAME_PREFIX[output], rng)}${pick(C.NAME_SLOT[slot], rng)}`, requiredLevel: C.QUAL[output].req,
    weaponType: slot === 'weapon' ? p.weaponType as string : null, set, affixes: affixes(output, slot === 'weapon' ? p.weaponType as string : null, rng) };
  w.items.push(item); w.lastForge = { id: w.sequence, failed, successPercent, materialQuality: quality, grade, item: structuredClone(item), cost };
  events.push(`${failed ? '锻造残次' : '锻造成功'}：${output}·${item.name}；成功率${successPercent}%，材料已消耗${failed ? '，不返还' : ''}。`);
  return { cost: 0, events };
}
