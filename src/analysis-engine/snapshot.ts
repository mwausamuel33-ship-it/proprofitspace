import { DigitDistribution, EvenOddAnalysis, OverUnderAnalysis, digitDistribution, evenOddAnalysis, overUnderAnalysis } from './distribution';
import { MarketFeed } from './market-feed';
import { DataStatus } from './status';
import {
    PayoutLookup, StrategyResult, digitTransitionStrategy, evenOddStrategy, marketRegimeStrategy, matchesDiffersStrategy, overUnderStrategy,
} from './strategies';
import { TICK_WINDOWS } from './tick-buffer';

export type AnalysisSettings = { primaryWindow: number; barrier: number };

export type WindowRow = {
    window: number;
    n: number;
    complete: boolean;
    evenShare: number;
    oddShare: number;
    underShare: number;
    equalShare: number;
    overShare: number;
    mostFrequent: number[];
    chiSquareP: number;
};

export type AnalysisSnapshot = {
    market: string;
    status: DataStatus;
    loading: boolean;
    error: string | null;
    ticks: { size: number; history: number; live: number; gapsSeen: number; counters: Record<string, number> };
    latest: { digit: number; quote: string; epoch: number } | null;
    windows: WindowRow[]; // multi-window comparison
    distribution: DigitDistribution; // primary window
    evenOdd: EvenOddAnalysis;
    overUnder: OverUnderAnalysis;
    results: {
        overUnder: StrategyResult;
        evenOdd: StrategyResult;
        matchesDiffers: StrategyResult;
        digitTransition: StrategyResult;
        marketRegime: StrategyResult;
    };
};

/** One consistent view of the market, built only from the validated buffer. */
export const buildSnapshot = (feed: MarketFeed, payout: PayoutLookup, settings: AnalysisSettings): AnalysisSnapshot => {
    const { buffer } = feed;
    const ticks = buffer.all();
    const tail = buffer.contiguousTail(); // only ticks with no missing ticks between them
    const digits = tail.map(t => t.digit);
    const primary = buffer.window(settings.primaryWindow).digits;
    const input = { market: feed.symbol, digits, hasGap: false, primaryWindow: settings.primaryWindow, payout };
    const last = ticks[ticks.length - 1];
    const windows: WindowRow[] = TICK_WINDOWS.map(w => {
        const win = buffer.window(w);
        const ou = overUnderAnalysis(win.digits, settings.barrier);
        const eo = evenOddAnalysis(win.digits);
        const dist = digitDistribution(win.digits);
        return {
            window: w,
            n: win.digits.length,
            complete: win.complete,
            evenShare: eo.even.share,
            oddShare: eo.odd.share,
            underShare: ou.under.share,
            equalShare: ou.equal.share,
            overShare: ou.over.share,
            mostFrequent: win.digits.length ? dist.mostFrequent : [],
            chiSquareP: dist.chiSquare.pValue,
        };
    });
    return {
        market: feed.symbol,
        status: feed.status(),
        loading: feed.loading,
        error: feed.lastError,
        ticks: {
            size: ticks.length,
            history: ticks.filter(t => t.source === 'history').length,
            live: ticks.filter(t => t.source === 'live').length,
            gapsSeen: buffer.counters.gaps,
            counters: { ...buffer.counters },
        },
        latest: last ? { digit: last.digit, quote: last.quoteText, epoch: last.epoch } : null,
        windows,
        distribution: digitDistribution(primary),
        evenOdd: evenOddAnalysis(primary),
        overUnder: overUnderAnalysis(primary, settings.barrier),
        results: {
            overUnder: overUnderStrategy({ ...input, barrier: settings.barrier }),
            evenOdd: evenOddStrategy(input),
            matchesDiffers: matchesDiffersStrategy(input),
            digitTransition: digitTransitionStrategy(input),
            marketRegime: marketRegimeStrategy(input),
        },
    };
};
