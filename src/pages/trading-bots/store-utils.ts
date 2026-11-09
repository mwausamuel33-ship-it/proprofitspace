import type { TStoreBot } from './new-bots';

export type TCategory = 'all' | 'digit' | 'evenodd' | 'risefall' | 'hedge' | 'recovery' | 'other';

export const CATEGORY_LABELS: Record<Exclude<TCategory, 'all'>, string> = {
    digit: 'Over / Under',
    evenodd: 'Even / Odd',
    risefall: 'Rise / Fall',
    hedge: 'Hedge',
    recovery: 'Recovery',
    other: 'Other',
};

// Scratch files from testing: not shown in the store.
const SCRATCH_NAMES = new Set(['minimal test', 'sam', 'trading bot']);
export const isScratchBot = (bot: TStoreBot) => SCRATCH_NAMES.has(bot.name.trim().toLowerCase());

export const categoryOf = (bot: TStoreBot): Exclude<TCategory, 'all'> => {
    const name = bot.name.toLowerCase();
    const text = bot.description.toLowerCase();
    if (name.includes('hedge') || name.includes('sametick')) return 'hedge';
    if (name.includes('recovery') || name.includes('cycle')) return 'recovery';
    if (text.includes('even/odd') || name.includes('even odd') || name.includes(' eo ')) return 'evenodd';
    if (text.includes('rise/fall') || text.includes('higher/lower') || text.includes('callput')) return 'risefall';
    if (text.includes('over/under') || text.includes('matches/differs') || /over|under|destroyer|differs/.test(name)) return 'digit';
    return 'other';
};

// "DIGITOVER2 STRATEGY 3" and "BOT V2" are versions of "DIGITOVER2 STRATEGY" and "BOT".
export const baseName = (name: string) =>
    name
        .trim()
        .replace(/\s+(v\d+|\d+)$/i, '')
        .replace(/\s+(v\d+|\d+)$/i, '')
        .trim()
        .toLowerCase();

/** Keeps the newest version of each bot (the last one listed) and counts how many versions there are. */
export const collapseVersions = (bots: TStoreBot[]) => {
    const groups = new Map<string, TStoreBot[]>();
    bots.forEach(bot => {
        const key = baseName(bot.name);
        groups.set(key, [...(groups.get(key) ?? []), bot]);
    });
    const versions: Record<string, number> = {};
    const shown: TStoreBot[] = [];
    const done = new Set<string>();
    bots.forEach(bot => {
        const key = baseName(bot.name);
        if (done.has(key)) return;
        done.add(key);
        const group = groups.get(key)!;
        const newest = group[group.length - 1];
        versions[newest.id] = group.length;
        shown.push(newest);
    });
    return { shown, versions };
};
