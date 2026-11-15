/** Bots shown in the Trading Bots store. The XML files live in src/xml. */
export type TStoreBot = {
    id: string;
    name: string;
    description: string;
    rating: number;
    xml?: () => string | Promise<string>;
    is_new?: boolean;
    /** Load with the market the trader last analysed. */
    follow_market?: boolean;
    /** Listed in the Premium section. */
    premium?: boolean;
    /** Card colour for premium bots, a 6-digit hex like #a78bfa. */
    accent?: string;
};

const loadXml = async (name: string): Promise<string> => {
    const mod = await import(/* webpackChunkName: `[request]` */ `../../xml/${name}.xml`);
    return mod.default;
};

export const NEW_BOTS: TStoreBot[] = [
    {
        id: 'over1-bot',
        name: 'Falcon Over 1',
        description:
            'Over 1 with smart entries on 8, 1, 2, 5 and 6. Skips the green bar. Martingale recovery on Over 2 or 3.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over1_Bot'),
    },
    {
        id: 'over2-bot',
        name: 'Hawk Over 2',
        description: 'Over 2 with smart entries on 8, 1, 2, 5 and 6. Skips the green bar. Recovers on Over 3.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over2_Bot'),
    },
    {
        id: 'under-bot',
        name: 'Viper Under 8 or 7',
        description:
            'Under 8 or 7, your choice, with smart entries on 8, 1, 4, 7 and 9. Skips the green bar. Recovers one digit lower.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Under_Bot'),
    },
    {
        id: 'under-bot-v2',
        name: 'Viper Under 8 or 7 V2',
        description:
            'Viper without entry points. Press Run when you see your own entry and it trades Under straight away. Same Under 8 or 7 choice, same recovery, take profit and stop loss as the Viper. It keeps trading until take profit or stop loss is hit.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Under_Bot_V2'),
    },
    {
        id: 'over2-manual',
        name: 'Eagle Over 2 Manual',
        description:
            'Over 2 on your own entry: press Run when you see it. Three runs, then it stops. After a loss it recovers, then stops.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over2_Manual'),
    },
    {
        id: 'under7-manual',
        name: 'Cobra Under 7 Manual',
        description:
            'Under 7 on your own entry: press Run when you see it. Three runs, then it stops. After a loss it recovers, then stops.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Under7_Manual'),
    },
    {
        id: 'step-index-bot',
        name: 'Step Index Up/Down Bot',
        description:
            'Trades Rise or Fall on a Step Index. You analyse the market, set DIRECTION (1 = Rise, 0 = Fall), the stake, take profit, stop loss, martingale and duration in the first block, then press Run. It trades straight away, recovers with martingale after a loss, and can switch direction while recovering if you set it to.',
        rating: 5,
        is_new: true,
        xml: () => loadXml('StepIndex_Bot'),
    },
    {
        id: 'even-odd-cycle-bot',
        name: 'Panther Even Odd Cycle',
        description:
            'Trades Even on the first run, Odd on the second, then Even again, and repeats. The cycle never changes, win or lose. Flat stake with take profit and stop loss. Choose which side starts in the first block.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('EvenOddCycle_Bot'),
    },
    {
        id: 'even-odd-recovery-bot',
        name: 'Wolf Even Odd Recovery',
        description:
            'Trades Even or Odd, your choice. After a loss on Even it waits for two odd digits in a row, then trades Odd (and the reverse after a loss on Odd). If the recovery trades lose it goes back to your normal contract. Martingale stake, take profit and stop loss built in.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('EvenOddRecovery_Bot'),
    },
    {
        id: 'apex-over1-v2',
        name: 'Apex Over 1 V2',
        description:
            'Over 1 when digits 0 and 1 are each below 10.5%. After a loss it recovers on Over 3, then Over 2, then Over 3, with stakes sized to win back the whole loss, then goes back to Over 1. Take profit, stop loss and max stake built in.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#a78bfa',
        xml: () => loadXml('Over1_V2_Premium'),
    },
    {
        id: 'atlas-over1-v3',
        name: 'Atlas Over 1 V3',
        description:
            'Over 1 when digits 0 and 1 are each below 10.5%. After a loss it recovers on Over 2 twice, with stakes sized from the Over 2 payout so a win gets back the whole loss, then goes back to Over 1.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#38bdf8',
        xml: () => loadXml('Over1_V3_Premium'),
    },
    {
        id: 'nova-under8-v2',
        name: 'Nova Under 8 V2',
        description:
            'Under 8 when digits 8 and 9 are each below 10.5%. After a loss it recovers on Under 6 and, if that loses, on Under 6 again, with stakes sized to win back the whole loss, then goes back to Under 8.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#34d399',
        xml: () => loadXml('Under8_V2_Premium'),
    },
    {
        id: 'orion-under8-v3',
        name: 'Orion Under 8 V3',
        description:
            'Under 8 when digits 8 and 9 are each below 10.5%. After a loss it recovers on Under 7 twice, with stakes sized from the Under 7 payout so a win gets back the whole loss, then goes back to Under 8.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#fb7185',
        xml: () => loadXml('Under8_V3_Premium'),
    },
    {
        id: 'oracle-auto-analysis',
        name: 'Oracle Auto Analysis',
        description:
            'No self analysis needed. It reads the last digits of the market (10 to 1000 ticks) and plans Over 1 or Under 8, then confirms the entry: a 1 then a higher digit, or an 8 then a lower digit. After a loss it picks the best recovery from Over 2, Over 3, Under 6 and Under 7, and it stops once the recovery is over. Over/Under digits.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#e879f9',
        xml: () => loadXml('Premium_Auto_Analysis_Bot'),
    },
    {
        id: 'oracle-updated-v3',
        name: 'Oracle Updated V3',
        description:
            'Reads the market and waits for a 1 then a higher digit (Over 1) or an 8 then a lower digit (Under 8), then trades the number of runs in a row you set (3 by default), waits for the next pattern and repeats the cycle. A loss on Over 1 recovers on Under 6 then Over 3, a loss on Under 8 recovers on Over 3 then Under 6, with stakes sized to win back the whole loss, then it waits for the next pattern. Over/Under digits.',
        rating: 5,
        is_new: true,
        follow_market: true,
        premium: true,
        accent: '#fb923c',
        xml: () => loadXml('Oracle_Updated_V3'),
    },
];
