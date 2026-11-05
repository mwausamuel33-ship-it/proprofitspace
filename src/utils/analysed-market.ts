/** The market the trader last analysed (Analysis Tool, scanners, Signal Center). Bots that follow the market use it on load. */
const KEY = 'pps.analysed_market';
const VALID = /^(R_\d+|1HZ\d+V|JD\d+)$/;

export const setAnalysedMarket = (symbol: string) => {
    if (!VALID.test(symbol)) return;
    try {
        localStorage.setItem(KEY, symbol);
        window.dispatchEvent(new CustomEvent('pps:analysed-market', { detail: symbol }));
    } catch {
        /* storage unavailable: nothing to remember */
    }
};

export const getAnalysedMarket = (): string | null => {
    try {
        const symbol = localStorage.getItem(KEY);
        return symbol && VALID.test(symbol) ? symbol : null;
    } catch {
        return null;
    }
};

/** Point a bot's XML at the analysed market (digits Over/Under stays as the bot defines it). */
export const withMarket = (xml: string, symbol: string | null): string => {
    if (!symbol || !VALID.test(symbol)) return xml;
    const submarket = symbol.startsWith('JD') ? 'jump_index' : 'random_index';
    return xml
        .replace(/(<field name="SUBMARKET_LIST">)[^<]*(<\/field>)/, `$1${submarket}$2`)
        .replace(/(<field name="SYMBOL_LIST">)[^<]*(<\/field>)/, `$1${symbol}$2`);
};
