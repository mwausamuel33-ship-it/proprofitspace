/**
 * The last digit of a Deriv quote, taken at the market's own price precision (pip_size).
 * A quote of 1234.5 on a 2-decimal market is 1234.50, so its digit is 0 (not 5).
 * Returns null instead of guessing when the quote or precision is unusable.
 */
export const lastDigit = (quote: number | string, pipSize: number): number | null => {
    if (!Number.isInteger(pipSize) || pipSize < 0 || pipSize > 8) return null;
    let text: string;
    if (typeof quote === 'string') {
        const trimmed = quote.trim();
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
        const decimals = trimmed.includes('.') ? trimmed.split('.')[1].length : 0;
        text = decimals === pipSize ? trimmed : Number(trimmed).toFixed(pipSize);
    } else {
        if (!Number.isFinite(quote)) return null;
        text = quote.toFixed(pipSize);
    }
    const digit = text.charCodeAt(text.length - 1) - 48;
    return digit >= 0 && digit <= 9 ? digit : null;
};
