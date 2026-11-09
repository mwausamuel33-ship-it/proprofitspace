/** Bots exported from earlier sessions. The XML files live in public/bots and are fetched when Load is pressed. */
type TDownloadedBot = { id: string; name: string; rating: number; description: string; xml: () => Promise<string> };

const fromFile = (slug: string, name: string, description: string): TDownloadedBot => ({
    id: `dl-${slug}`,
    name,
    rating: 5,
    description,
    xml: async () => {
        const response = await fetch(`/bots/${slug}.xml`);
        if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
        return response.text();
    },
});

export const DOWNLOADED_BOTS: TDownloadedBot[] = [
    fromFile('adaptive-digits-overunder-bot', 'ADAPTIVE DIGITS OVERUNDER BOT', 'Volatility 100 (1s) Over/Under. Buys Over, Under. Includes martingale stake, loss recovery.'),
    fromFile('adaptive-digits-overunder-bot-2', 'ADAPTIVE DIGITS OVERUNDER BOT V2', 'Volatility 100 (1s) Over/Under. Buys Over, Under. Includes martingale stake, loss recovery.'),
    fromFile('alternating-rise-fall-bot', 'ALTERNATING RISE FALL BOT', 'Volatility 100 Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('alternating-rise-fall-bot-v2', 'ALTERNATING RISE FALL BOT V2', 'Volatility 100 Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('bot1-differs-random-low', 'BOT1 DIFFERS RANDOM LOW', 'Volatility 10 Matches/Differs. Buys Differs. Includes take profit / stop loss.'),
    fromFile('bot1-differs-random-low-2', 'BOT1 DIFFERS RANDOM LOW V2', 'Volatility 10 Matches/Differs. Buys Differs. Includes take profit / stop loss.'),
    fromFile('bot2-over0-over1-alternator', 'BOT2 OVER0 OVER1 ALTERNATOR', 'Volatility 10 Over/Under. Buys Over. Includes take profit / stop loss.'),
    fromFile('dbot-hedge-1hz100v', 'DBOT HEDGE 1HZ100V', 'Volatility 100 (1s) Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('dbot-hedge-r100', 'DBOT HEDGE R100', 'Volatility 100 Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('dbot-hedge-r100-v2', 'DBOT HEDGE R100 V2', 'Volatility 100 Rise/Fall. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('deriv-autonomous-digit-bot-phase1', 'DERIV AUTONOMOUS DIGIT BOT PHASE1', 'Volatility 25 Even/Odd. Buys Even. Includes take profit / stop loss.'),
    fromFile('deriv-autonomous-digit-bot-v2', 'DERIV AUTONOMOUS DIGIT BOT V2', 'Volatility 10 Even/Odd. Buys Even. Includes take profit / stop loss.'),
    fromFile('deriv-rapid-hedge-bot', 'DERIV RAPID HEDGE BOT', 'selectable market Trade. Buys FALL, RISE. Simple one-trade loop.'),
    fromFile('deriv-rapid-hedge-bot-2', 'DERIV RAPID HEDGE BOT V2', 'Volatility 100 Rise/Fall. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('digitover2-strategy', 'DIGITOVER2 STRATEGY', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake.'),
    fromFile('digitover2-strategy-2', 'DIGITOVER2 STRATEGY V2', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake.'),
    fromFile('digitover2-strategy-3', 'DIGITOVER2 STRATEGY V3', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake.'),
    fromFile('digitover2-strategy-4', 'DIGITOVER2 STRATEGY V4', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake.'),
    fromFile('eo-smart-guard-pro-v1', 'EO SMART GUARD PRO V1', 'Volatility 100 (1s) Even/Odd. Buys Even, Odd. Includes martingale stake.'),
    fromFile('eo-smart-guard-pro-v1-2', 'EO SMART GUARD PRO V1 V2', 'Volatility 100 (1s) Even/Odd. Buys Even, Odd. Includes martingale stake, take profit / stop loss.'),
    fromFile('even-odd-switcher-ii', 'EVEN ODD SWITCHER II', 'Volatility 10 (1s) Even/Odd. Buys Even, Odd. Simple one-trade loop.'),
    fromFile('higher-lower-alternator-bot', 'HIGHER LOWER ALTERNATOR BOT', 'Volatility 100 Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('higherlower-alternating-bot', 'HIGHERLOWER ALTERNATING BOT', 'Volatility 100 Higher/Lower. Buys Rise/Higher, Fall/Lower. Includes martingale stake, loss recovery, take profit / stop loss.'),
    fromFile('higherlower-sametick-higher-leg', 'HIGHERLOWER SAMETICK HIGHER LEG', 'Volatility 100 Higher/Lower. Buys Rise/Higher. Includes martingale stake, loss recovery, take profit / stop loss.'),
    fromFile('higherlower-sametick-lower-leg', 'HIGHERLOWER SAMETICK LOWER LEG', 'Volatility 100 Higher/Lower. Buys Fall/Lower. Includes martingale stake, loss recovery, take profit / stop loss.'),
    fromFile('higherthenlower-backtoback-bot', 'HIGHERTHENLOWER BACKTOBACK BOT', 'Volatility 100 Higher/Lower. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('higherthenlower-backtoback-bot-v2', 'HIGHERTHENLOWER BACKTOBACK BOT V2', 'Volatility 100 Callput. Buys Rise/Higher, Fall/Lower. Simple one-trade loop.'),
    fromFile('kenyan-over-under-bot', 'KENYAN OVER UNDER BOT', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake, take profit / stop loss.'),
    fromFile('kenyan-over-under-bot-2', 'KENYAN OVER UNDER BOT V2', 'Volatility 100 Over/Under. Buys Over, Under. Includes martingale stake, loss recovery, take profit / stop loss.'),
    fromFile('minimal-test', 'MINIMAL TEST', 'Volatility 100 Over/Under. Buys Over. Simple one-trade loop.'),
    fromFile('ou-smart-guard-pro-v1', 'OU SMART GUARD PRO V1', 'Volatility 100 (1s) Over/Under. Buys Over, Under. Includes martingale stake, take profit / stop loss.'),
    fromFile('sam', 'SAM', 'stpRNG4 Callput. Buys Rise/Higher. Simple one-trade loop.'),
    fromFile('sammee-over-1destroyer', 'SAMMEE OVER 1DESTROYER', 'Volatility 100 Over/Under. Buys Over. Includes martingale stake, loss recovery, last-digit entry filter.'),
    fromFile('sammee-simple-over', 'SAMMEE SIMPLE OVER', 'Volatility 75 (1s) Over/Under. Buys Over. Includes martingale stake, take profit / stop loss.'),
    fromFile('sequential-overunder-recovery-bot', 'SEQUENTIAL OVERUNDER RECOVERY BOT', 'Volatility 100 Over/Under. Buys Over, Under. Includes martingale stake, loss recovery, take profit / stop loss.'),
    fromFile('toggle-higherlower-bot', 'TOGGLE HIGHERLOWER BOT', 'selectable market Trade. Buys FALL, RISE. Simple one-trade loop.'),
    fromFile('trading-bot', 'TRADING BOT', 'Volatility 10 (1s) Even/Odd. Buys Even, Odd. Simple one-trade loop.'),
];
