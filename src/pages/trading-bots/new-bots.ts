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
];
