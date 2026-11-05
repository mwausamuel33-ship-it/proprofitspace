/** New bots shown first in the Trading Bots store. The XML files live in src/xml. */
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
        id: 'over1-destroyer',
        name: 'Over 1 Destroyer',
        description:
            'An Over market bot. Opens on the market you analysed and trades Over 1 only when digits 0 and 1 are both below 10.5%. Enters on last digit 2, 5 or 6 and skips any entry digit running hot. After a loss it recovers with Martingale on Over 3 (change it in the bot settings). Take profit and stop loss built in.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Over1_Destroyer'),
    },
    {
        id: 'under8-destroyer',
        name: 'Under 8 Destroyer',
        description:
            'An Under market bot. Opens on the market you analysed and trades Under 8 only when digits 8 and 9 are both below 10.5%. Enters on last digit 4, 7 or 9 and skips any entry digit running hot. After a loss it recovers with Martingale on Under 6 (change it in the bot settings). Take profit and stop loss built in.',
        rating: 5,
        is_new: true,
        follow_market: true,
        xml: () => loadXml('Under8_Destroyer'),
    },
    {
        id: 'over1-under8-cycle',
        name: 'Over1 Under8 Cycle Recovery',
        description:
            'Trades Over 1 on the first run and Under 8 on the second, then repeats the cycle with no analysis. After a loss it recovers with Over 2 using a calculated stake until the loss is cleared. Max recovery steps, max stake, take profit and stop loss included.',
        rating: 5,
        is_new: true,
        xml: () => loadXml('Over1_Under8_Recovery_Bot'),
    },
];
