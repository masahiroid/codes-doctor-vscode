import { ruleDigest } from './ruleset';
import type { PackChannel, SecurityPack } from './ruleset';

/** What changed between two rulesets, so the items to check again can be pointed out after an update. */

export interface RuleChange {
  packId: string;
  ruleId: string;
  title: string;
  channel: PackChannel;
}

export interface RulesetChanges {
  addedPacks: Array<{ id: string; version: string; channel: PackChannel }>;
  removedPacks: Array<{ id: string; version: string }>;
  updatedPacks: Array<{ id: string; from: string; to: string; channel: PackChannel }>;
  addedRules: RuleChange[];
  /** Rules whose content changed; their review evidence no longer applies. */
  changedRules: RuleChange[];
  removedRules: RuleChange[];
  /** Rules whose advisory moved to `fix_status: released` (a fix is out): check again and apply it. */
  fixReleased: Array<RuleChange & { from?: string }>;
}

export const RELEASED_FIX_STATUS = 'released';

/** Changes from `previous` to `current`. With no previous ruleset, every pack counts as added. */
export function compareRulesets(previous: SecurityPack[] | undefined, current: SecurityPack[]): RulesetChanges {
  const changes: RulesetChanges = { addedPacks: [], removedPacks: [], updatedPacks: [], addedRules: [], changedRules: [], removedRules: [], fixReleased: [] };
  const before = new Map((previous ?? []).map((pack) => [pack.id, pack]));
  for (const pack of current) {
    const old = before.get(pack.id);
    before.delete(pack.id);
    const change = (rule: SecurityPack['rules'][number]): RuleChange => ({ packId: pack.id, ruleId: rule.id, title: rule.title, channel: pack.channel });
    if (!old) {
      changes.addedPacks.push({ id: pack.id, version: pack.version, channel: pack.channel });
      for (const rule of pack.rules) {
        changes.addedRules.push(change(rule));
        if (previous && rule.fixStatus === RELEASED_FIX_STATUS) changes.fixReleased.push(change(rule));
      }
      continue;
    }
    if (old.version !== pack.version) changes.updatedPacks.push({ id: pack.id, from: old.version, to: pack.version, channel: pack.channel });
    const oldRules = new Map(old.rules.map((rule) => [rule.id, rule]));
    for (const rule of pack.rules) {
      const was = oldRules.get(rule.id);
      oldRules.delete(rule.id);
      if (!was) changes.addedRules.push(change(rule));
      else if (ruleDigest(was) !== ruleDigest(rule)) changes.changedRules.push(change(rule));
      if (rule.fixStatus === RELEASED_FIX_STATUS && was?.fixStatus !== RELEASED_FIX_STATUS) {
        changes.fixReleased.push({ ...change(rule), ...(was?.fixStatus ? { from: was.fixStatus } : {}) });
      }
    }
    for (const rule of oldRules.values()) changes.removedRules.push({ packId: old.id, ruleId: rule.id, title: rule.title, channel: old.channel });
  }
  for (const old of before.values()) {
    changes.removedPacks.push({ id: old.id, version: old.version });
    for (const rule of old.rules) changes.removedRules.push({ packId: old.id, ruleId: rule.id, title: rule.title, channel: old.channel });
  }
  return changes;
}

export const hasRulesetChanges = (changes: RulesetChanges) => Object.values(changes).some((list) => list.length > 0);
