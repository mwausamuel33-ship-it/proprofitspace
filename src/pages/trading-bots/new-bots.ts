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
};

const loadXml = async (name: string): Promise<string> => {
    const mod = await import(/* webpackChunkName: `[request]` */ `../../xml/${name}.xml`);
    return mod.default;
};

export const NEW_BOTS: TStoreBot[] = [
    {
        id: 'over1-bot',
        name: 'Over 1 Bot',
        description:
            'Trades Over 1 on the market you analysed. You set the stake, take profit, stop loss and martingale. After a loss it recovers on Over 2 or Over 3, whichever you set (Over 3 by default). Enters on last digit 8, 1, 2, 5 or 6 and never on the most frequent digit (the green bar). Change your settings in the first block before you run it.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over1_Bot'),
    },
    {
        id: 'over2-bot',
        name: 'Over 2 Bot',
        description:
            'Trades Over 2 on the market you analysed. You set the stake, take profit, stop loss and martingale. After a loss it recovers on Over 3. Enters on last digit 8, 1, 2, 5 or 6 and never on the most frequent digit (the green bar). Change your settings in the first block before you run it.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over2_Bot'),
    },
    {
        id: 'under-bot',
        name: 'Under Bot',
        description:
            'Trades Under 8 or Under 7, whichever you set. You also set the stake, take profit, stop loss and martingale. After a loss it recovers on Under 7 or Under 6, whichever you set (Under 7 by default). Enters on last digit 8, 1, 4, 7 or 9 and never on the most frequent digit (the green bar). Change your settings in the first block before you run it.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Under_Bot'),
    },
    {
        id: 'over-under-5-bot',
        name: 'Over 5 / Under 5 Cycle Bot',
        description:
            'Trades Over 5 on the first run, Under 5 on the second, and repeats that cycle. After a loss it recovers on the opposite side (lost on Under 5, it trades Over 5) until it wins, then goes back to the cycle. You set the stake, take profit, stop loss, martingale and max recovery. Change your settings in the first block before you run it.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('OverUnder5_Bot'),
    },
    {
        id: 'over-under-5-flip-bot',
        name: 'Over 5 / Under 5 Flip Recovery Bot',
        description:
            'Trades Over 5 on the first run, Under 5 on the second, and repeats that cycle. After a loss it recovers on the opposite side (lost on Under 5, it trades Over 5), and if that loses it switches again, and so on until it wins, then goes back to the cycle. You set the stake, take profit, stop loss, martingale and max recovery. Change your settings in the first block before you run it.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('OverUnder5Flip_Bot'),
    },
];
