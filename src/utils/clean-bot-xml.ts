/**
 * Strips blocks that can't affect a bot before it is loaded into Bot Builder:
 * loose blocks nothing runs, disabled blocks, never-called functions and variables that are set but never read.
 * If anything looks wrong the original XML is returned untouched.
 */
const KEEP_ROOTS = new Set([
    'trade_definition',
    'before_purchase',
    'during_purchase',
    'after_purchase',
    'tick_analysis',
    'procedures_defnoreturn',
    'procedures_defreturn',
]);
const LOOP_TYPES = new Set(['controls_for', 'controls_forEach']);

const kids = (n: Element) => Array.from(n.children);
const fieldText = (b: Element, name: string): string | null => {
    const f = kids(b).find(c => c.tagName === 'field' && c.getAttribute('name') === name);
    return f ? (f.textContent ?? '').trim() : null;
};
const blocksOf = (root: Element) => Array.from(root.getElementsByTagName('block'));

// Removes a statement block and links the block after it to its parent. Value blocks are never removed.
const removeStatement = (b: Element): boolean => {
    const parent = b.parentElement;
    if (!parent || !['statement', 'next', 'xml'].includes(parent.tagName)) return false;
    const next_el = kids(b).find(c => c.tagName === 'next');
    const next_block = next_el ? kids(next_el).find(c => c.tagName === 'block') : undefined;
    if (next_block) {
        parent.replaceChild(next_block, b);
    } else {
        parent.removeChild(b);
        if (parent.tagName === 'next') parent.parentElement?.removeChild(parent);
    }
    return true;
};

export const cleanBotXml = (xml: string): string => {
    try {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return xml;
        const root = doc.documentElement;
        const isBot = (r: Element) => blocksOf(r).some(b => b.getAttribute('type') === 'trade_definition');
        if (!isBot(root)) return xml;

        // 1. loose blocks floating on the workspace that nothing runs
        kids(root)
            .filter(c => c.tagName === 'block' && !KEEP_ROOTS.has(c.getAttribute('type') ?? ''))
            .forEach(b => root.removeChild(b));

        // 2. disabled blocks
        blocksOf(root)
            .filter(b => b.getAttribute('disabled') === 'true')
            .forEach(b => {
                if (b.parentElement) removeStatement(b);
            });

        // 3. functions that are never called
        let changed = true;
        while (changed) {
            changed = false;
            const called = new Set(
                blocksOf(root)
                    .filter(b => ['procedures_callnoreturn', 'procedures_callreturn'].includes(b.getAttribute('type') ?? ''))
                    .map(b => b.getElementsByTagName('mutation')[0]?.getAttribute('name'))
            );
            kids(root)
                .filter(c => c.tagName === 'block' && ['procedures_defnoreturn', 'procedures_defreturn'].includes(c.getAttribute('type') ?? ''))
                .forEach(b => {
                    if (!called.has(fieldText(b, 'NAME'))) {
                        root.removeChild(b);
                        changed = true;
                    }
                });
        }

        // 4. variables that are assigned but never read anywhere
        changed = true;
        while (changed) {
            changed = false;
            const reads = new Set<string | null>();
            const loops = new Set<string | null>();
            const sets = new Map<string | null, Element[]>();
            blocksOf(root).forEach(b => {
                const type = b.getAttribute('type') ?? '';
                const name = fieldText(b, 'VAR');
                if (type === 'variables_get') reads.add(name);
                else if (type === 'variables_set' || type === 'math_change') sets.set(name, [...(sets.get(name) ?? []), b]);
                else if (LOOP_TYPES.has(type)) loops.add(name);
            });
            sets.forEach((list, name) => {
                if (reads.has(name) || loops.has(name)) return;
                list.forEach(b => {
                    if (b.parentElement && removeStatement(b)) changed = true;
                });
            });
        }

        // 5. variable declarations nothing refers to any more
        const used = new Set<string | null>(blocksOf(root).map(b => fieldText(b, 'VAR')));
        Array.from(root.getElementsByTagName('arg')).forEach(a => used.add(a.getAttribute('name')));
        Array.from(root.getElementsByTagName('variable')).forEach(v => {
            if (!used.has((v.textContent ?? '').trim())) v.parentElement?.removeChild(v);
        });

        const out = new XMLSerializer().serializeToString(root);
        const check = new DOMParser().parseFromString(out, 'application/xml');
        if (check.getElementsByTagName('parsererror').length || !isBot(check.documentElement)) return xml;
        return out;
    } catch {
        return xml;
    }
};
