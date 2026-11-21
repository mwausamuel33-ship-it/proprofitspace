/** Numerical helpers for the analysis engine. No dependencies, no random numbers. */

const EPS = 1e-15;
const FPMIN = 1e-300;

/** ln Gamma(x) for x > 0: shift x up to 10, then the Stirling series. */
export const logGamma = (x: number): number => {
    if (!(x > 0)) throw new RangeError('logGamma needs x > 0');
    let shift = 0;
    let z = x;
    while (z < 10) {
        shift += Math.log(z);
        z += 1;
    }
    const z2 = z * z;
    const series = 1 / (12 * z) - 1 / (360 * z * z2) + 1 / (1260 * z * z2 * z2) - 1 / (1680 * z * z2 * z2 * z2);
    return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + series - shift;
};

const gammaSeries = (a: number, x: number): number => {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 2000; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
};

const gammaContinuedFraction = (a: number, x: number): number => {
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 2000; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = b + an / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
};

/** Regularised upper incomplete gamma function Q(a, x). */
export const gammaQ = (a: number, x: number): number => {
    if (x <= 0) return 1;
    return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
};

const erfc = (x: number): number => gammaQ(0.5, x * x); // for x >= 0

/** Standard normal cumulative distribution. */
export const normalCdf = (z: number): number => (z >= 0 ? 1 - 0.5 * erfc(z / Math.SQRT2) : 0.5 * erfc(-z / Math.SQRT2));

/** Chi-square survival function: P(X >= x) with df degrees of freedom. */
export const chiSquareSf = (x: number, df: number): number => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

const logFactorialTable: number[] = [0, 0];
const logFactorial = (n: number): number => {
    for (let i = logFactorialTable.length; i <= n; i++) logFactorialTable.push(logFactorialTable[i - 1] + Math.log(i));
    return logFactorialTable[n];
};
const logChoose = (n: number, k: number): number => logFactorial(n) - logFactorial(k) - logFactorial(n - k);
const logPmf = (k: number, n: number, p: number): number => logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p);

/** Exact two-sided binomial test (same rule as R and SciPy): total probability of outcomes no likelier than k. */
export const binomialTwoSidedP = (k: number, n: number, p: number): number => {
    if (n <= 0) return 1;
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    const ref = logPmf(k, n, p) + 1e-7;
    let total = 0;
    for (let i = 0; i <= n; i++) {
        const lp = logPmf(i, n, p);
        if (lp <= ref) total += Math.exp(lp);
    }
    return Math.min(1, total);
};

/** Exact one-sided test: P(X >= k) when the true probability is p. */
export const binomialUpperTailP = (k: number, n: number, p: number): number => {
    if (k <= 0) return 1;
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let total = 0;
    for (let i = k; i <= n; i++) total += Math.exp(logPmf(i, n, p));
    return Math.min(1, total);
};

/** Wilson score interval for a proportion (95% by default). */
export const wilsonInterval = (successes: number, n: number, z = 1.959963984540054): { low: number; high: number } => {
    if (n <= 0) return { low: 0, high: 1 };
    const p = successes / n;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
    return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
};

/** Benjamini-Hochberg adjusted p-values (false discovery rate), returned in the input order. */
export const benjaminiHochberg = (pValues: number[]): number[] => {
    const m = pValues.length;
    const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
    const adjusted = new Array<number>(m).fill(1);
    let running = 1;
    for (let r = m - 1; r >= 0; r--) {
        running = Math.min(running, (order[r].p * m) / (r + 1));
        adjusted[order[r].i] = Math.min(1, running);
    }
    return adjusted;
};

/** Holm-Bonferroni adjusted p-values (family-wise error rate), returned in the input order. */
export const holm = (pValues: number[]): number[] => {
    const m = pValues.length;
    const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
    const adjusted = new Array<number>(m).fill(1);
    let running = 0;
    order.forEach((o, r) => {
        running = Math.max(running, (m - r) * o.p);
        adjusted[o.i] = Math.min(1, running);
    });
    return adjusted;
};
