import { api_base } from '@/external/bot-skeleton';

export type TDigitStat = {
    digit: number;
    count: number;
    percentage: number;
};

export type TEvenOddStat = {
    even_count: number;
    odd_count: number;
    even_percentage: number;
    odd_percentage: number;
};

/**
 * Figures out how many decimal places a symbol quotes at (its "pip size"),
 * so the last digit of a tick can be read reliably even when the raw
 * number drops trailing zeroes (e.g. 474.30 -> 474.3).
 */
export const getDecimalPlaces = (symbol?: string): number => {
    if (!symbol) return 2;
    const symbols = api_base?.active_symbols || [];
    const found = symbols.find((s: any) => (s.symbol || s.underlying_symbol) === symbol);
    const pip = found?.pip;
    if (!pip) return 2;
    const pip_str = String(pip);
    const decimal_part = pip_str.split('.')[1];
    return decimal_part ? decimal_part.length : 0;
};

/** Extracts the last digit of a quote at a given decimal precision. */
export const getLastDigit = (quote: number, decimals: number): number => {
    const fixed = quote.toFixed(decimals);
    const last_char = fixed.charAt(fixed.length - 1);
    const digit = Number(last_char);
    return Number.isNaN(digit) ? 0 : digit;
};

/** Builds a 0-9 frequency distribution (count + percentage) from a list of last digits. */
export const computeDigitDistribution = (digits: number[]): TDigitStat[] => {
    const counts = new Array(10).fill(0);
    digits.forEach(d => {
        if (d >= 0 && d <= 9) counts[d] += 1;
    });
    const total = digits.length || 1;
    return counts.map((count, digit) => ({
        digit,
        count,
        percentage: Number(((count / total) * 100).toFixed(1)),
    }));
};

export const getMostFrequentDigit = (stats: TDigitStat[]): number | null => {
    if (!stats.length) return null;
    return stats.reduce((max, curr) => (curr.count > max.count ? curr : max), stats[0]).digit;
};

export const getLeastFrequentDigit = (stats: TDigitStat[]): number | null => {
    if (!stats.length) return null;
    return stats.reduce((min, curr) => (curr.count < min.count ? curr : min), stats[0]).digit;
};

/** Computes Even/Odd frequency split from a list of last digits. */
export const computeEvenOdd = (digits: number[]): TEvenOddStat => {
    const total = digits.length || 1;
    const even_count = digits.filter(d => d % 2 === 0).length;
    const odd_count = digits.length - even_count;
    return {
        even_count,
        odd_count,
        even_percentage: Number(((even_count / total) * 100).toFixed(1)),
        odd_percentage: Number(((odd_count / total) * 100).toFixed(1)),
    };
};

/** Returns the volatility / synthetic-index style markets available for analysis. */
export const getSyntheticMarkets = (): { symbol: string; display_name: string }[] => {
    const symbols = api_base?.active_symbols || [];
    return symbols
        .filter((s: any) => s.market === 'synthetic_index')
        .map((s: any) => ({
            symbol: s.symbol || s.underlying_symbol,
            display_name: s.display_name || s.symbol,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
};
