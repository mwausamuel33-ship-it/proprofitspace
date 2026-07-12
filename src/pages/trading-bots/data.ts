export type TPremiumBot = {
    id: string;
    name: string;
    rating: number;
    description: string;
};

export const PREMIUM_BOTS: TPremiumBot[] = [
    {
        id: 'cmv-pro',
        name: 'THE CMV PRO',
        rating: 5,
        description:
            'Premium CMV Pro trading bot with a multi-strategy approach, combining technical analysis with automated execution.',
    },
    {
        id: 'auto-greenflakes-eo',
        name: 'AUTO GREENFLAKES E O',
        rating: 5,
        description:
            'Advanced Even/Odd bot with automated trading, built-in risk management, and profit optimization.',
    },
    {
        id: 'under-blast-pro',
        name: 'UNDER BLAST PRO',
        rating: 5,
        description:
            'High-performance Under trading bot with a blast strategy, optimized for rapid execution and high-probability trades.',
    },
    {
        id: 'over1-r32-pro',
        name: 'OVER1 R32 PRO',
        rating: 5,
        description:
            'Professional Over 1 trading bot with an R32 recovery strategy, optimized for high win rates and intelligent recovery.',
    },
    {
        id: 'over2-r43-pro',
        name: 'OVER2 R43 PRO',
        rating: 5,
        description:
            'Advanced Over 2 bot featuring an R43 recovery system, designed for consistent entries and recovery strategies.',
    },
    {
        id: 'under8-r67-pro',
        name: 'UNDER8 R67 PRO',
        rating: 5,
        description:
            'Advanced Under 8 trading bot with an R67 recovery system, designed for optimal performance and pattern recognition.',
    },
    {
        id: 'under7-r56-pro',
        name: 'UNDER7 R56 PRO',
        rating: 5,
        description:
            'Professional Under 7 bot with an R56 recovery mechanism, featuring intelligent risk management for consistent returns.',
    },
];
