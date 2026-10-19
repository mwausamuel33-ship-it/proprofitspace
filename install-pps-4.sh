#!/usr/bin/env bash
# ProProfitSpace update 4: visual redesign (theme, landing page, dashboard, scanner, Entry Scanner).
# Run from the repo root:  bash install-pps-4.sh
cd "$(dirname "$0")" || exit 1
[ -d src ] || { echo "src/ not found. Put this file in ~/proprofitspace/proprofitspace and run: bash install-pps-4.sh"; exit 1; }
[ -f src/pages/signal-scanner/scanner-widgets.tsx ] || { echo "Update 3 is missing. Run install-pps-3.sh first."; exit 1; }

mkdir -p src/styles src/pages/entry-scanner src/pages/dashboard src/pages/signal-scanner
B=.pps-backup4-$(date +%H%M%S); mkdir -p "$B"
for f in src/styles/pps-theme.scss src/pages/entry-scanner/entry-scanner.scss src/pages/dashboard/landing.tsx src/pages/dashboard/landing.scss src/pages/dashboard/dashboard-pps.scss src/pages/dashboard/dashboard.tsx src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss; do
  [ -f "$f" ] && mkdir -p "$B/$(dirname $f)" && cp "$f" "$B/$f"
done
cat > src/styles/pps-theme.scss <<'PPS_EOF'
// ProProfitSpace look: shared tokens, nicer tab bar, smoother controls.
// Imported by the pps pages, so it works without touching the Deriv theme files.

:root {
    --pps-bg: #0b1324;
    --pps-surface: #121d36;
    --pps-surface-2: #182646;
    --pps-border: rgba(148, 163, 184, 0.2);
    --pps-text: #e8eef9;
    --pps-muted: #9fb0cc;
    --pps-accent: #22d3ee;
    --pps-accent-2: #6366f1;
    --pps-good: #34d399;
    --pps-warn: #fbbf24;
    --pps-bad: #fb7185;
    --pps-gradient: linear-gradient(135deg, #22d3ee, #6366f1);
}

/* ---- tab bar: pill tabs with a gradient underline ---- */
.main__container .dc-tabs {
    &__list {
        gap: 4px;
        padding: 6px 8px 0;
    }

    &__item {
        border-radius: 10px 10px 0 0;
        transition:
            background 0.2s ease,
            color 0.2s ease;

        &:hover {
            background: rgba(34, 211, 238, 0.1);
        }
    }

    &__active {
        background: linear-gradient(180deg, rgba(34, 211, 238, 0.16), rgba(99, 102, 241, 0.1)) !important;
        border-radius: 10px 10px 0 0;
    }

    &__active-line {
        height: 3px !important;
        border-radius: 3px;
        background: var(--pps-gradient) !important;
    }
}

/* ---- thin, subtle scrollbars inside our pages ---- */
.pps-sc-page,
.pps-entry-scanner,
.pps-sc__scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.35) transparent;

    &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.35);
        border-radius: 8px;
    }
}

/* ---- gentle entrance for pages and cards ---- */
@keyframes pps-rise {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.pps-sc,
.pps-dashboard__hero,
.pps-dashboard__stat,
.pps-entry-card {
    animation: pps-rise 0.35s ease both;
}

@media (prefers-reduced-motion: reduce) {
    .pps-sc,
    .pps-dashboard__hero,
    .pps-dashboard__stat,
    .pps-entry-card {
        animation: none;
    }
}
PPS_EOF
cat > src/pages/entry-scanner/entry-scanner.scss <<'PPS_EOF'
// Entry Scanner: same dark card look as the Destroyer Scanner.
.pps-entry-scanner {
    --es-bg: #0b1324;
    --es-surface: #121d36;
    --es-surface-2: #182646;
    --es-border: rgba(148, 163, 184, 0.2);
    --es-text: #e8eef9;
    --es-muted: #9fb0cc;
    --es-accent: #22d3ee;
    --es-good: #34d399;
    --es-warn: #fbbf24;
    --es-bad: #fb7185;

    box-sizing: border-box;
    max-width: 1100px;
    height: calc(100vh - 204px);
    margin: 12px auto;
    padding: 20px;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    background: var(--es-bg);
    color: var(--es-text);
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.4;

    @supports (height: 100dvh) {
        height: calc(100dvh - 204px);
    }

    @media (max-width: 1023px) {
        height: calc(100vh - 239px);
        margin: 8px;
        padding: 14px;

        @supports (height: 100dvh) {
            height: calc(100dvh - 239px);
        }
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
    }

    &__title {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--es-accent);
        -webkit-text-fill-color: var(--es-accent);
        background: none;
    }

    &__subtitle {
        margin: 4px 0 0;
        font-size: 20px;
        font-weight: 800;
        color: var(--es-text);
        -webkit-text-fill-color: var(--es-text);
        background: none;

        @media (max-width: 720px) {
            font-size: 17px;
        }
    }

    &__status {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    &__last-scan {
        font-size: 12px;
        color: var(--es-muted);
        font-family: monospace;
    }

    &__scanning-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border: 1px solid var(--es-accent);
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        color: var(--es-accent);
    }

    &__scanning-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--es-accent);
        animation: pps-es-pulse 1s infinite;
    }

    &__filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 18px;
        padding: 16px;
        background: var(--es-surface);
        border: 1px solid var(--es-border);
        border-radius: 12px;
    }

    &__filter {
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: flex-end;
    }

    &__filter-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--es-muted);
        text-transform: none;
        letter-spacing: 0;
    }

    &__select {
        width: 100%;
        padding: 9px 10px;
        background: var(--es-bg);
        color: var(--es-text);
        border: 1px solid var(--es-border);
        border-radius: 8px;
        font-size: 15px;

        &:focus {
            outline: none;
            border-color: var(--es-accent);
        }
    }

    &__range {
        width: 100%;
        accent-color: var(--es-accent);
        height: 28px;
    }

    &__toggle {
        position: relative;
        display: inline-block;
        width: 46px;
        height: 26px;

        input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        input:checked + .pps-entry-scanner__toggle-slider {
            background: var(--es-accent);
        }
        input:checked + .pps-entry-scanner__toggle-slider::before {
            transform: translateX(20px);
        }
    }

    &__toggle-slider {
        position: absolute;
        inset: 0;
        background: rgba(148, 163, 184, 0.35);
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.2s ease;

        &::before {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: transform 0.2s ease;
        }
    }

    &__results {
        margin-top: 22px;
    }

    &__results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    &__results-title {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
        color: var(--es-text);
        -webkit-text-fill-color: var(--es-text);
        background: none;
    }

    &__results-count {
        padding: 3px 12px;
        font-size: 12px;
        font-weight: 700;
        color: var(--es-accent);
        background: rgba(34, 211, 238, 0.12);
        border-radius: 999px;
    }

    &__empty {
        padding: 24px;
        text-align: center;
        color: var(--es-muted);
        background: var(--es-surface);
        border: 1px dashed var(--es-border);
        border-radius: 12px;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
    }
}

.pps-entry-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    background: #121d36;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 14px;
    color: #e8eef9;
    transition:
        transform 0.2s ease,
        border-color 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        border-color: rgba(34, 211, 238, 0.55);
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
    }

    &__rank {
        font-family: monospace;
        font-size: 12px;
        color: #22d3ee;
    }

    &__market {
        font-weight: 700;
        text-align: right;
        color: #e8eef9;
    }

    &__badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        background: rgba(148, 163, 184, 0.18);
        color: #9fb0cc;

        &--over {
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
        }
        &--under {
            background: rgba(251, 113, 133, 0.15);
            color: #fb7185;
        }
        &--even {
            background: rgba(34, 211, 238, 0.15);
            color: #22d3ee;
        }
        &--odd {
            background: rgba(167, 139, 250, 0.18);
            color: #a78bfa;
        }
    }

    &__confidence {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    &__confidence-bar {
        flex: 1;
        height: 6px;
        background: rgba(148, 163, 184, 0.2);
        border-radius: 999px;
        overflow: hidden;
    }

    &__confidence-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.4s ease;
    }

    &__confidence-value {
        min-width: 38px;
        text-align: right;
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        color: #e8eef9;
    }

    &__footer {
        display: flex;
        justify-content: flex-end;
    }

    &__time {
        font-family: monospace;
        font-size: 11px;
        color: #9fb0cc;
    }
}

@keyframes pps-es-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.3;
    }
}
PPS_EOF
cat > src/pages/dashboard/landing.tsx <<'PPS_EOF'
import { Localize } from '@deriv-com/translations';
import './landing.scss';

type TLandingProps = { onLaunch: () => void };

const FEATURES = [
    {
        icon: '◎',
        title: 'Scans every index',
        text: 'All Volatility, Volatility (1s) and Jump indices are checked every 20 seconds over their last 1000 ticks.',
    },
    {
        icon: '★',
        title: 'Rated by strength',
        text: 'Signals below 10% are marked Strong, so the best setups rise to the top of the list.',
    },
    {
        icon: '⚡',
        title: 'One-click bot',
        text: 'Load the Destroyer bot for that market with its entry digits and recovery step already set.',
    },
];

const STEPS = [
    { n: '1', title: 'Scan', text: 'The scanner reads the last-digit spread of every market.' },
    { n: '2', title: 'Rate', text: 'Over and Under signals appear when the losing digits run low.' },
    { n: '3', title: 'Trade', text: 'Load the bot, start on a demo account, and watch the results.' },
];

const SAMPLE = [
    { market: 'Volatility 75 (1s) Index', badge: 'Over 2', side: 'over', stars: 3, digits: '0 8.9% · 1 9.2% · 2 9.6%', entry: '2 5 6' },
    { market: 'Jump 25 Index', badge: 'Under 8', side: 'under', stars: 2, digits: '8 9.4% · 9 9.8%', entry: '4 7 9' },
    { market: 'Volatility 50 Index', badge: 'Over 1', side: 'over', stars: 1, digits: '0 10.1% · 1 10.3%', entry: '2 5 6' },
];

const Landing = ({ onLaunch }: TLandingProps) => (
    <div className='pps-landing'>
        <div className='pps-landing__glow pps-landing__glow--a' />
        <div className='pps-landing__glow pps-landing__glow--b' />
        <div className='pps-landing__grid-bg' />

        <div className='pps-landing__inner'>
            <nav className='pps-landing__nav'>
                <div className='pps-landing__brand'>
                    <span className='pps-landing__logo'>P</span>
                    <span>ProProfitSpace</span>
                </div>
                <button className='pps-landing__nav-btn' onClick={onLaunch}>
                    <Localize i18n_default_text='Launch app' />
                </button>
            </nav>

            <span className='pps-landing__pill'>Digit trading workspace for Deriv</span>

            <h1 className='pps-landing__headline'>
                <Localize i18n_default_text='Scan every synthetic index.' />{' '}
                <span className='pps-landing__headline-accent'>
                    <Localize i18n_default_text='Load the right bot in one click.' />
                </span>
            </h1>
            <p className='pps-landing__sub'>
                <Localize i18n_default_text='A live market scanner, the Sammee Destroyer bot and a visual bot builder, all in one place.' />
            </p>

            <div className='pps-landing__actions'>
                <button className='pps-landing__cta' onClick={onLaunch}>
                    <Localize i18n_default_text='Launch app' />
                </button>
                <a className='pps-landing__link' href='#signal_scanner' onClick={onLaunch}>
                    <Localize i18n_default_text='Open the scanner' /> →
                </a>
            </div>

            <div className='pps-landing__preview'>
                <div className='pps-landing__preview-bar'>
                    <span className='pps-landing__live' /> Destroyer Scanner
                    <em>Example</em>
                </div>
                {SAMPLE.map(r => (
                    <div key={r.market} className='pps-landing__preview-row'>
                        <b>{r.market}</b>
                        <span className={`pps-landing__badge pps-landing__badge--${r.side}`}>{r.badge}</span>
                        <span className='pps-landing__stars'>
                            {'★'.repeat(r.stars)}
                            <i>{'★'.repeat(3 - r.stars)}</i>
                        </span>
                        <span className='pps-landing__digits'>{r.digits}</span>
                        <span className='pps-landing__entry'>Entry {r.entry}</span>
                    </div>
                ))}
            </div>

            <div className='pps-landing__grid'>
                {FEATURES.map(f => (
                    <div key={f.title} className='pps-landing__card'>
                        <span className='pps-landing__icon'>{f.icon}</span>
                        <h3>{f.title}</h3>
                        <p>{f.text}</p>
                    </div>
                ))}
            </div>

            <h2 className='pps-landing__h2'>How it works</h2>
            <div className='pps-landing__steps'>
                {STEPS.map(s => (
                    <div key={s.n} className='pps-landing__step'>
                        <span className='pps-landing__step-n'>{s.n}</span>
                        <div>
                            <h3>{s.title}</h3>
                            <p>{s.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            <button className='pps-landing__cta pps-landing__cta--bottom' onClick={onLaunch}>
                <Localize i18n_default_text='Launch app' />
            </button>

            <p className='pps-landing__risk'>
                Trading carries risk and past digit frequencies do not predict the next tick. Practise on a demo account
                first.
            </p>
        </div>
    </div>
);

export default Landing;
PPS_EOF
cat > src/pages/dashboard/landing.scss <<'PPS_EOF'
.pps-landing {
    position: fixed;
    inset: 0;
    z-index: 2000;
    overflow-y: auto;
    overflow-x: hidden;
    background: #060b18;
    color: #e8eef9;
    display: flex;
    justify-content: center;
    font-family: Inter, system-ui, sans-serif;
    -webkit-overflow-scrolling: touch;

    &__glow {
        position: absolute;
        width: 760px;
        height: 760px;
        border-radius: 50%;
        filter: blur(90px);
        pointer-events: none;
        opacity: 0.55;
        animation: pps-landing-float 14s ease-in-out infinite alternate;

        &--a {
            top: -260px;
            left: -120px;
            background: radial-gradient(circle, rgba(34, 211, 238, 0.45), transparent 65%);
        }

        &--b {
            top: 120px;
            right: -220px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.45), transparent 65%);
            animation-delay: -6s;
        }
    }

    &__grid-bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
            linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: radial-gradient(ellipse at 50% 0%, #000 20%, transparent 70%);
    }

    &__inner {
        position: relative;
        width: 100%;
        max-width: 1000px;
        padding: 24px 24px 64px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    &__nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    &__brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 800;
    }

    &__logo {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-weight: 900;
    }

    &__nav-btn {
        padding: 8px 18px;
        background: rgba(255, 255, 255, 0.06);
        color: #e8eef9;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 10px;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;

        &:hover {
            border-color: #22d3ee;
            color: #22d3ee;
        }
    }

    &__pill {
        margin-top: 56px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #22d3ee;
        background: rgba(34, 211, 238, 0.1);
        border: 1px solid rgba(34, 211, 238, 0.3);
        border-radius: 999px;
    }

    &__headline {
        margin: 20px 0 16px;
        max-width: 820px;
        font-size: clamp(32px, 5.4vw, 58px);
        line-height: 1.08;
        font-weight: 900;
        letter-spacing: -0.025em;
        color: #f4f8ff;
    }

    &__headline-accent {
        background: linear-gradient(135deg, #22d3ee, #a5b4fc);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    &__sub {
        margin: 0;
        max-width: 620px;
        font-size: 17px;
        line-height: 1.6;
        color: #a9b8d3;
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: 22px;
        margin-top: 30px;
        flex-wrap: wrap;
        justify-content: center;
    }

    &__cta {
        padding: 14px 34px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 10px 34px rgba(34, 211, 238, 0.28);
        transition:
            transform 0.15s ease,
            box-shadow 0.15s ease;

        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 40px rgba(34, 211, 238, 0.4);
        }

        &--bottom {
            margin-top: 48px;
        }
    }

    &__link {
        color: #22d3ee;
        font-weight: 700;
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }

    /* ---- example scanner card ---- */
    &__preview {
        width: 100%;
        max-width: 760px;
        margin-top: 48px;
        text-align: left;
        background: rgba(18, 29, 54, 0.8);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 16px;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(8px);
        overflow: hidden;
    }

    &__preview-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        font-size: 13px;
        font-weight: 700;
        background: rgba(24, 38, 70, 0.9);

        em {
            margin-left: auto;
            font-style: normal;
            font-size: 11px;
            color: #9fb0cc;
        }
    }

    &__live {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #34d399;
        animation: pps-landing-pulse 2s infinite;
    }

    &__preview-row {
        display: grid;
        grid-template-columns: 1.5fr auto auto 1.4fr auto;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-top: 1px solid rgba(148, 163, 184, 0.16);
        font-size: 13px;

        b {
            font-weight: 700;
        }

        @media (max-width: 720px) {
            grid-template-columns: 1fr auto;

            .pps-landing__digits,
            .pps-landing__entry {
                grid-column: 1 / -1;
            }
        }
    }

    &__badge {
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        white-space: nowrap;

        &--over {
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
        }
        &--under {
            background: rgba(251, 113, 133, 0.15);
            color: #fb7185;
        }
    }

    &__stars {
        color: #fbbf24;
        letter-spacing: 1px;

        i {
            font-style: normal;
            opacity: 0.22;
        }
    }

    &__digits {
        font-family: monospace;
        font-size: 12px;
        color: #9fb0cc;
    }

    &__entry {
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        color: #22d3ee;
    }

    /* ---- features ---- */
    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        width: 100%;
        margin-top: 56px;
    }

    &__card {
        padding: 24px;
        text-align: left;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 16px;
        transition:
            transform 0.2s ease,
            border-color 0.2s ease;

        &:hover {
            transform: translateY(-3px);
            border-color: rgba(34, 211, 238, 0.5);
        }

        h3 {
            margin: 14px 0 8px;
            font-size: 16px;
            font-weight: 800;
            color: #f4f8ff;
        }

        p {
            margin: 0;
            font-size: 14px;
            line-height: 1.55;
            color: #a9b8d3;
        }
    }

    &__icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 18px;
        color: #22d3ee;
        background: rgba(34, 211, 238, 0.12);
        border-radius: 12px;
    }

    &__h2 {
        margin: 64px 0 20px;
        font-size: 26px;
        font-weight: 900;
        color: #f4f8ff;
    }

    &__steps {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        width: 100%;
    }

    &__step {
        display: flex;
        gap: 14px;
        padding: 18px;
        text-align: left;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 14px;

        h3 {
            margin: 0 0 4px;
            font-size: 15px;
            font-weight: 800;
            color: #f4f8ff;
        }

        p {
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            color: #a9b8d3;
        }
    }

    &__step-n {
        flex: none;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        font-weight: 900;
        color: #04101f;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        border-radius: 50%;
    }

    &__risk {
        margin: 36px 0 0;
        max-width: 560px;
        font-size: 12px;
        color: #7d8eab;
    }
}

@keyframes pps-landing-float {
    from {
        transform: translate(0, 0);
    }
    to {
        transform: translate(40px, 30px);
    }
}

@keyframes pps-landing-pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
    }
    70% {
        box-shadow: 0 0 0 8px rgba(52, 211, 153, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .pps-landing__glow,
    .pps-landing__live {
        animation: none;
    }
}
PPS_EOF
cat > src/pages/dashboard/dashboard-pps.scss <<'PPS_EOF'
// Loaded after dashboard.scss. Fixed colours so the cards stay readable in any theme.
.pps-dashboard {
    &__hero {
        position: relative;
        overflow: hidden;
        background:
            radial-gradient(500px 200px at 90% -40px, rgba(99, 102, 241, 0.35), transparent 70%),
            radial-gradient(420px 180px at 5% 120%, rgba(34, 211, 238, 0.22), transparent 70%), #0b1324;
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 16px;
    }

    &__title {
        font-size: 30px;
        font-weight: 900;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, #22d3ee, #a5b4fc);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    &__subtitle {
        font-size: 14px;
        color: #b6c4df;
    }

    &__hero-btn {
        font-size: 14px;
        font-weight: 800;
        color: #04101f;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        border-radius: 10px;
        transition:
            transform 0.15s ease,
            filter 0.15s ease;

        &:hover {
            transform: translateY(-1px);
            filter: brightness(1.1);
        }

        &--secondary {
            color: #22d3ee;
            background: transparent;
            border: 1px solid #22d3ee;
        }
    }

    &__stat {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px 16px 16px 20px;
        background: #0f1a33;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 14px;
        transition:
            transform 0.2s ease,
            border-color 0.2s ease;

        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 14px;
            bottom: 14px;
            width: 3px;
            border-radius: 3px;
            background: linear-gradient(180deg, #22d3ee, #6366f1);
        }

        &:hover {
            transform: translateY(-2px);
            border-color: rgba(34, 211, 238, 0.5);
        }
    }

    &__stat-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        color: #8fa3c4;
    }

    &__stat-value {
        font-size: 20px;
        font-weight: 800;
        color: #f1f6ff;
    }

    &__stat-note {
        font-size: 12px;
        color: #9fb0cc;
    }

    &__results {
        margin: 12px 0;
    }
}

// The My computer / Bot Builder / Quick strategy cards were stacking vertically.
// This lays out whatever the Cards component renders as a wrapping row.
.pps-dashboard .quick-panel > :last-child {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 16px;
    align-items: stretch;

    > * {
        flex: 1 1 200px;
        max-width: 280px;
    }
}
PPS_EOF
cat > src/pages/dashboard/dashboard.tsx <<'PPS_EOF'
import React, { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize, Localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import { SessionResults } from '../signal-scanner/scanner-widgets';
import Landing from './landing';
import '@/styles/pps-theme.scss';
import './dashboard.scss';
import './dashboard-pps.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const LANDING_KEY = 'pps_landing_seen';

const readLandingSeen = () => {
    try {
        return localStorage.getItem(LANDING_KEY) === '1';
    } catch {
        return false;
    }
};

const RULE_CARDS = [
    { label: 'Over rule', value: '0,1,2 < 10.5%', note: 'Over 1 or Over 2 · entry on 2, 5, 6' },
    { label: 'Under rule', value: '9,8,7 < 10.5%', note: 'Under 8 or Under 7 · entry on 4, 7, 9' },
    { label: 'Markets', value: 'Vol + Jump', note: 'All indices, last 1000 ticks' },
    { label: 'Recovery', value: 'Martingale', note: 'Safer barrier after a loss, capped steps' },
];

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    const is_logged_in = client.is_logged_in;
    const [show_landing, setShowLanding] = useState(() => !readLandingSeen());

    const launchApp = () => {
        try {
            localStorage.setItem(LANDING_KEY, '1');
        } catch {
            /* storage blocked: the landing page just shows again next visit */
        }
        setShowLanding(false);
    };

    return (
        <React.Fragment>
            {show_landing && <Landing onLaunch={launchApp} />}
            <div
                className={classNames('pps-dashboard', {
                    'pps-dashboard--tour-active': active_tour,
                })}
            >
                <div className='pps-dashboard__content'>
                    {is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}

                    <div className='pps-dashboard__hero'>
                        <div className='pps-dashboard__hero-text'>
                            <h1 className='pps-dashboard__title'>ProProfitSpace</h1>
                            <p className='pps-dashboard__subtitle'>
                                <Localize i18n_default_text='Scan every Volatility and Jump index, then load the Destroyer bot in one click' />
                            </p>
                        </div>
                        <div className='pps-dashboard__hero-actions'>
                            <button className='pps-dashboard__hero-btn' onClick={() => handleTabChange(5)}>
                                <Localize i18n_default_text='Open Scanner' />
                            </button>
                            <button
                                className='pps-dashboard__hero-btn pps-dashboard__hero-btn--secondary'
                                onClick={() => handleTabChange(1)}
                            >
                                <Localize i18n_default_text='Bot Builder' />
                            </button>
                        </div>
                    </div>

                    {is_logged_in && (
                        <div className='pps-dashboard__results'>
                            <SessionResults />
                        </div>
                    )}

                    <div className='pps-dashboard__stats'>
                        {RULE_CARDS.map(card => (
                            <div key={card.label} className='pps-dashboard__stat'>
                                <span className='pps-dashboard__stat-label'>{card.label}</span>
                                <span className='pps-dashboard__stat-value'>{card.value}</span>
                                <span className='pps-dashboard__stat-note'>{card.note}</span>
                            </div>
                        ))}
                    </div>

                    <div className='quick-panel'>
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                            })}
                        >
                            {!has_dashboard_strategies && (
                                <Text
                                    className='title'
                                    as='h2'
                                    color='prominent'
                                    size={isDesktop ? 'sm' : 's'}
                                    lineHeight='xxl'
                                    weight='bold'
                                >
                                    {localize('Load or build your bot')}
                                </Text>
                            )}
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                            >
                                {is_google_drive_configured
                                    ? localize(
                                          'Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.'
                                      )
                                    : localize(
                                          'Import a bot from your computer, build it from scratch, or start with a quick strategy.'
                                      )}
                            </Text>
                        </div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
PPS_EOF
cat > src/pages/signal-scanner/signal-scanner.tsx <<'PPS_EOF'
import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import { useStore } from '@/hooks/useStore';
import { DEFAULT_THRESHOLD, DestroyerStrength, FAIR_SHARE } from '@/utils/destroyer-rules';
import { assessStake } from '@/utils/stake-guard';
import { generateDestroyerBotXml } from '@/utils/signal-bot-xml';
import { load } from '@/external/bot-skeleton';
import { Localize } from '@deriv-com/translations';
import '@/styles/pps-theme.scss';
import { AccountBadge, SessionResults, StakeGuard } from './scanner-widgets';
import './signal-scanner.scss';

const SCAN_INTERVAL_MS = 20000;
const LOSING_ZONE = [0, 1, 2, 7, 8, 9];

const STARS: Record<DestroyerStrength, number> = { strong: 3, good: 2, weak: 1 };
const STRENGTH_LABEL: Record<DestroyerStrength, string> = { strong: 'Strong', good: 'Good', weak: 'Weak' };
const STRENGTH_HINT: Record<DestroyerStrength, string> = {
    strong: `Every losing digit is below ${FAIR_SHARE}%`,
    good: `Losing digits average below ${FAIR_SHARE}%, but one is above it`,
    weak: `Below your threshold, but losing digits average ${FAIR_SHARE}% or more`,
};

type TFilter = 'all' | 'strong' | 'over' | 'under';

const Countdown = ({
    nextAt,
    scanning,
    onScanNow,
}: {
    nextAt: number | null;
    scanning: boolean;
    onScanNow: () => void;
}) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, []);

    const remaining_ms = nextAt ? Math.max(0, nextAt - now) : 0;
    const seconds = Math.ceil(remaining_ms / 1000);
    const pct = nextAt ? Math.min(100, Math.max(0, 100 - (remaining_ms / SCAN_INTERVAL_MS) * 100)) : 0;

    return (
        <div className='pps-sc__countdown'>
            <div className='pps-sc__countdown-top'>
                <span className='pps-sc__live'>
                    <i className={classNames('pps-sc__dot', { 'pps-sc__dot--busy': scanning })} />
                    {scanning ? 'Scanning markets…' : nextAt ? `Next scan in ${seconds}s` : 'Waiting for first scan…'}
                </span>
                <button className='pps-sc__scan-now' onClick={onScanNow} disabled={scanning}>
                    Scan now
                </button>
            </div>
            <div className='pps-sc__bar'>
                <div
                    className={classNames('pps-sc__bar-fill', { 'pps-sc__bar-fill--busy': scanning })}
                    style={{ width: scanning ? '100%' : `${pct}%` }}
                />
            </div>
        </div>
    );
};

const SignalScanner = observer(() => {
    const { client } = useStore();
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [stake, setStake] = useState(1);
    const [maxRuns, setMaxRuns] = useState(3);
    const [martingale, setMartingale] = useState(2);
    const [filter, setFilter] = useState<TFilter>('all');
    const { rows, signals, is_scanning, last_scan, next_scan_at, scanNow } = useDestroyerScanner({
        threshold,
        interval_ms: SCAN_INTERVAL_MS,
    });

    const strong_count = signals.filter(s => s.signal.strength === 'strong').length;
    const visible = useMemo(
        () =>
            signals.filter(s => {
                if (filter === 'strong') return s.signal.strength === 'strong';
                if (filter === 'over') return s.signal.side === 'over';
                if (filter === 'under') return s.signal.side === 'under';
                return true;
            }),
        [signals, filter]
    );

    const formatTime = (epoch: number) =>
        new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const handleLoadAndTrade = async (row: (typeof signals)[0]) => {
        // Safety check: confirm on real accounts and when the stake looks too big for the balance.
        const is_real = client.is_logged_in && !client.is_virtual;
        const guard = assessStake(stake, martingale, Number(client.balance));
        const warnings: string[] = [];
        if (is_real) warnings.push('This is a REAL money account.');
        if (guard.level !== 'ok') warnings.push(...guard.messages);
        if (
            warnings.length &&
            !window.confirm(`${warnings.join('\n')}\n\nLoad ${row.signal.label} on ${row.display_name}?`)
        ) {
            return;
        }

        const xmlString = generateDestroyerBotXml(row.signal, {
            symbol: row.symbol,
            stake,
            maxRuns,
            martingale,
        });

        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace) {
            window.location.hash = 'bot_builder';
            return;
        }

        await load({
            block_string: xmlString,
            file_name: `Destroyer - ${row.display_name} - ${row.signal.label}`,
            strategy_id: null,
            workspace,
            from: 'signal_scanner',
            drop_event: {},
            showIncompatibleStrategyDialog: false,
            show_snackbar: true,
        });

        workspace.strategy_to_load = xmlString;
        window.location.hash = 'bot_builder';
    };

    const filters: { id: TFilter; label: string; count: number }[] = [
        { id: 'all', label: 'All', count: signals.length },
        { id: 'strong', label: 'Strong', count: strong_count },
        { id: 'over', label: 'Over', count: signals.filter(s => s.signal.side === 'over').length },
        { id: 'under', label: 'Under', count: signals.filter(s => s.signal.side === 'under').length },
    ];

    return (
        <div className='pps-sc-page'>
            <div className='pps-sc'>
                <div className='pps-sc__header'>
                    <div>
                        <p className='pps-sc__eyebrow'>
                            <Localize i18n_default_text='Destroyer Scanner' />
                        </p>
                        <h2 className='pps-sc__title'>
                            <Localize i18n_default_text='Every Volatility and Jump index, scanned live' />
                        </h2>
                    </div>
                    {last_scan && <span className='pps-sc__time'>Last scan {formatTime(last_scan)}</span>}
                </div>

                <Countdown nextAt={next_scan_at} scanning={is_scanning} onScanNow={scanNow} />

                <div className='pps-sc__account'>
                    <AccountBadge />
                </div>

                <div className='pps-sc__stats'>
                    <div className='pps-sc__stat'>
                        <b>{signals.length}</b>
                        <span>Signals</span>
                    </div>
                    <div className='pps-sc__stat pps-sc__stat--good'>
                        <b>{strong_count}</b>
                        <span>Strong</span>
                    </div>
                    <div className='pps-sc__stat'>
                        <b>{rows.length}</b>
                        <span>Markets</span>
                    </div>
                </div>

                <div className='pps-sc__results'>
                    <SessionResults />
                </div>

                <div className='pps-sc__controls'>
                    <label className='pps-sc__field'>
                        <span>Threshold %</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='5'
                            max='15'
                            value={threshold}
                            onChange={e => setThreshold(Number(e.target.value) || DEFAULT_THRESHOLD)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Stake</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='0.35'
                            value={stake}
                            onChange={e => setStake(Number(e.target.value) || 1)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Martingale ×</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='1.1'
                            value={martingale}
                            onChange={e => setMartingale(Number(e.target.value) || 2)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Max runs</span>
                        <input
                            type='number'
                            inputMode='numeric'
                            min='1'
                            max='20'
                            value={maxRuns}
                            onChange={e => setMaxRuns(Math.max(1, Number(e.target.value) || 3))}
                        />
                    </label>
                </div>

                <StakeGuard stake={stake} martingale={martingale} />

                <div className='pps-sc__rules'>
                    <div>
                        <b>Over</b> · 0,1 low → Over 1 · 0,1,2 low → Over 2 · entry on 2, 5, 6
                    </div>
                    <div>
                        <b>Under</b> · 9,8 low → Under 8 · 9,8,7 low → Under 7 · entry on 4, 7, 9
                    </div>
                    <div>
                        <b>Rating</b> · ★★★ Strong: every losing digit under {FAIR_SHARE}% · ★★ Good: average under{' '}
                        {FAIR_SHARE}% · ★ Weak: under {threshold}% only
                    </div>
                </div>

                <div className='pps-sc__filters'>
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={classNames('pps-sc__filter', { 'pps-sc__filter--on': filter === f.id })}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label} <em>{f.count}</em>
                        </button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <div className='pps-sc__empty'>
                        {rows.length === 0
                            ? 'Waiting for tick history from the first scan…'
                            : 'No market matches right now. Try another filter, a lower threshold, or wait for the next scan.'}
                    </div>
                ) : (
                    <div className='pps-sc__list'>
                        <div className='pps-sc__row pps-sc__row--head'>
                            <span className='pps-sc__rank'>#</span>
                            <span className='pps-sc__main'>Market</span>
                            <span className='pps-sc__badgecell'>Signal</span>
                            <span className='pps-sc__rating'>Strength</span>
                            <span className='pps-sc__losing'>Losing digits</span>
                            <span className='pps-sc__entry'>Entry</span>
                            <span className='pps-sc__action' />
                        </div>
                        {visible.map((row, idx) => (
                            <div
                                key={row.symbol}
                                className={classNames('pps-sc__row', `pps-sc__row--${row.signal.strength}`)}
                            >
                                <span className='pps-sc__rank'>{idx + 1}</span>
                                <div className='pps-sc__main'>
                                    <div className='pps-sc__market'>{row.display_name}</div>
                                    <div className='pps-sc__sub'>Scanned {formatTime(row.scanned_at)}</div>
                                </div>
                                <span className='pps-sc__badgecell'>
                                    <span
                                        className={classNames('pps-sc__badge', {
                                            'pps-sc__badge--over': row.signal.side === 'over',
                                            'pps-sc__badge--under': row.signal.side === 'under',
                                        })}
                                    >
                                        {row.signal.label}
                                    </span>
                                </span>
                                <div className='pps-sc__rating' title={STRENGTH_HINT[row.signal.strength]}>
                                    <span className={`pps-sc__stars pps-sc__stars--${row.signal.strength}`}>
                                        {'★'.repeat(STARS[row.signal.strength])}
                                        <i>{'★'.repeat(3 - STARS[row.signal.strength])}</i>
                                    </span>
                                    <span className='pps-sc__rating-text'>
                                        {STRENGTH_LABEL[row.signal.strength]}
                                        <small>
                                            {Math.abs(row.signal.deviation) < 0.05
                                                ? '0.0'
                                                : `${row.signal.deviation > 0 ? '−' : '+'}${Math.abs(row.signal.deviation).toFixed(1)}`}{' '}
                                            pts
                                        </small>
                                    </span>
                                </div>
                                <div className='pps-sc__losing pps-sc__chips'>
                                    {row.signal.losingDigits.map(d => (
                                        <span
                                            key={d}
                                            className={classNames('pps-sc__chip', {
                                                'pps-sc__chip--under10': row.digit_pct[d] < FAIR_SHARE,
                                            })}
                                        >
                                            <b>{d}</b>
                                            {row.digit_pct[d].toFixed(1)}%
                                        </span>
                                    ))}
                                </div>
                                <div className='pps-sc__entry pps-sc__chips'>
                                    {row.signal.entryDigits.map(d => (
                                        <span key={d} className='pps-sc__chip pps-sc__chip--entry'>
                                            {d}
                                        </span>
                                    ))}
                                </div>
                                <div className='pps-sc__action'>
                                    <button className='pps-sc__btn' onClick={() => handleLoadAndTrade(row)}>
                                        Load &amp; Trade
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <h3 className='pps-sc__section'>All markets (last-digit %)</h3>
                <div className='pps-sc__scroll'>
                    <table className='pps-sc__table'>
                        <thead>
                            <tr>
                                <th>Market</th>
                                {Array.from({ length: 10 }, (_, d) => (
                                    <th key={d}>{d}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.symbol}>
                                    <td className='pps-sc__tmarket'>{row.display_name}</td>
                                    {row.digit_pct.map((pct, d) => (
                                        <td
                                            key={d}
                                            className={classNames('pps-sc__cell', {
                                                'pps-sc__cell--low': LOSING_ZONE.includes(d) && pct < threshold,
                                                'pps-sc__cell--strong': LOSING_ZONE.includes(d) && pct < FAIR_SHARE,
                                            })}
                                        >
                                            {pct.toFixed(1)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className='pps-sc__note'>
                    Strength measures how far the losing digits sit below their fair 10% share in the last 1000 ticks. It
                    describes past ticks and does not change the odds of the next one. Test on a demo account first and
                    keep stake and max runs small.
                </p>
            </div>
        </div>
    );
});

export default SignalScanner;
PPS_EOF
cat > src/pages/signal-scanner/signal-scanner.scss <<'PPS_EOF'
// The page scrolls inside its own box, so every signal is reachable on phones.
.pps-sc-page {
    height: calc(100vh - 180px);
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;

    @supports (height: 100dvh) {
        height: calc(100dvh - 180px);
    }

    @media (max-width: 1023px) {
        height: calc(100vh - 215px);

        @supports (height: 100dvh) {
            height: calc(100dvh - 215px);
        }
    }
}

.pps-sc {
    --sc-bg: #0b1324;
    --sc-surface: #121d36;
    --sc-surface-2: #182646;
    --sc-border: rgba(148, 163, 184, 0.2);
    --sc-text: #e8eef9;
    --sc-muted: #9fb0cc;
    --sc-accent: #22d3ee;
    --sc-good: #34d399;
    --sc-warn: #fbbf24;
    --sc-bad: #fb7185;

    max-width: 1100px;
    margin: 12px auto 24px;
    padding: 20px;
    background:
        radial-gradient(600px 220px at 85% -40px, rgba(99, 102, 241, 0.18), transparent 70%),
        radial-gradient(500px 200px at 10% -60px, rgba(34, 211, 238, 0.14), transparent 70%), var(--sc-bg);
    border: 1px solid var(--sc-border);
    color: var(--sc-text);
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.4;

    @media (max-width: 720px) {
        margin: 8px;
        padding: 14px;
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
    }

    &__eyebrow {
        margin: 0 0 4px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sc-accent);
    }

    &__title {
        margin: 0;
        font-size: 21px;
        font-weight: 800;
        color: var(--sc-text);

        @media (max-width: 720px) {
            font-size: 18px;
        }
    }

    &__time {
        font-size: 12px;
        color: var(--sc-muted);
        font-family: monospace;
    }

    /* ---- countdown ---- */
    &__countdown {
        margin-top: 16px;
        padding: 12px 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;
    }

    &__countdown-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }

    &__live {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 14px;
        color: var(--sc-text);
    }

    &__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--sc-good);
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
        animation: pps-sc-pulse 2s infinite;

        &--busy {
            background: var(--sc-accent);
            animation-duration: 0.8s;
        }
    }

    &__scan-now {
        padding: 6px 12px;
        background: transparent;
        color: var(--sc-accent);
        border: 1px solid var(--sc-accent);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;

        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    }

    &__bar {
        height: 5px;
        margin-top: 10px;
        background: rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        overflow: hidden;
    }

    &__bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #22d3ee, #6366f1);
        border-radius: 999px;
        transition: width 0.25s linear;

        &--busy {
            animation: pps-sc-shimmer 1s linear infinite;
            background-size: 200% 100%;
        }
    }

    &__account {
        margin-top: 12px;
    }

    &__results {
        margin-top: 12px;
    }

    /* ---- stats ---- */
    &__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 12px;
    }

    &__stat {
        display: flex;
        flex-direction: column;
        padding: 10px 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;

        b {
            font-size: 22px;
            font-weight: 800;
            color: var(--sc-text);
        }

        span {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
        }

        &--good b {
            color: var(--sc-good);
        }
    }

    /* ---- controls ---- */
    &__controls {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-top: 12px;
        padding: 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;

        @media (max-width: 720px) {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: var(--sc-muted);
        font-weight: 600;

        input {
            width: 100%;
            padding: 9px 10px;
            background: var(--sc-bg);
            color: var(--sc-text);
            border: 1px solid var(--sc-border);
            border-radius: 8px;
            font-size: 16px; // 16px stops iOS zooming into the field

            &:focus {
                outline: none;
                border-color: var(--sc-accent);
            }
        }
    }

    &__rules {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 8px;
        margin-top: 12px;
        color: var(--sc-muted);
        font-size: 12.5px;

        > div {
            padding: 10px 12px;
            background: var(--sc-surface);
            border-left: 3px solid var(--sc-accent);
            border-radius: 8px;
        }

        b {
            color: var(--sc-text);
        }
    }

    /* ---- filters ---- */
    &__filters {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 18px 0 10px;
    }

    &__filter {
        padding: 6px 14px;
        background: var(--sc-surface);
        color: var(--sc-muted);
        border: 1px solid var(--sc-border);
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;

        em {
            font-style: normal;
            margin-inline-start: 4px;
            color: var(--sc-text);
        }

        &--on {
            background: rgba(34, 211, 238, 0.14);
            color: var(--sc-accent);
            border-color: var(--sc-accent);
        }
    }

    &__empty {
        padding: 24px;
        text-align: center;
        color: var(--sc-muted);
        background: var(--sc-surface);
        border: 1px dashed var(--sc-border);
        border-radius: 12px;
    }

    /* ---- signal rows ---- */
    &__list {
        border: 1px solid var(--sc-border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--sc-surface);
    }

    &__row {
        display: grid;
        grid-template-columns: 28px minmax(140px, 1.3fr) 96px 130px minmax(150px, 1.2fr) 110px 118px;
        grid-template-areas: 'rank main badge rating losing entry action';
        gap: 8px 12px;
        align-items: center;
        padding: 12px 14px;
        border-top: 1px solid var(--sc-border);
        border-left: 3px solid transparent;

        &--head {
            padding-top: 9px;
            padding-bottom: 9px;
            background: var(--sc-surface-2);
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
            border-top: none;

            @media (max-width: 720px) {
                display: none;
            }
        }

        transition: background 0.2s ease;

        &:not(&--head):hover {
            background: rgba(34, 211, 238, 0.05);
        }

        &--strong {
            border-left-color: var(--sc-good);
            background: linear-gradient(90deg, rgba(52, 211, 153, 0.08), transparent 40%);
        }
        &--good {
            border-left-color: var(--sc-warn);
        }
        &--weak {
            border-left-color: rgba(148, 163, 184, 0.45);
        }

        @media (max-width: 720px) {
            grid-template-columns: 24px 1fr auto;
            grid-template-areas:
                'rank main badge'
                '. rating rating'
                '. losing losing'
                '. entry action';
        }
    }

    &__rank {
        grid-area: rank;
        font-family: monospace;
        font-size: 12px;
        color: var(--sc-muted);
    }
    &__main {
        grid-area: main;
        min-width: 0;
    }
    &__badgecell {
        grid-area: badge;
    }
    &__rating {
        grid-area: rating;
    }
    &__losing {
        grid-area: losing;
    }
    &__entry {
        grid-area: entry;
    }
    &__action {
        grid-area: action;
        text-align: right;
    }

    &__market {
        font-weight: 700;
        color: var(--sc-text);
    }

    &__sub {
        font-size: 11px;
        color: var(--sc-muted);
        font-family: monospace;
    }

    &__badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 6px;
        font-weight: 800;
        font-size: 12px;
        text-transform: uppercase;
        white-space: nowrap;

        &--over {
            background: rgba(52, 211, 153, 0.15);
            color: var(--sc-good);
        }
        &--under {
            background: rgba(251, 113, 133, 0.15);
            color: var(--sc-bad);
        }
    }

    &__rating {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__stars {
        font-size: 15px;
        letter-spacing: 1px;
        white-space: nowrap;

        i {
            font-style: normal;
            opacity: 0.22;
        }

        &--strong {
            color: var(--sc-good);
        }
        &--good {
            color: var(--sc-warn);
        }
        &--weak {
            color: var(--sc-muted);
        }
    }

    &__rating-text {
        display: flex;
        flex-direction: column;
        font-weight: 700;
        font-size: 13px;
        color: var(--sc-text);
        line-height: 1.15;

        small {
            font-size: 11px;
            font-weight: 600;
            color: var(--sc-muted);
            font-family: monospace;
        }
    }

    &__chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    &__chip {
        display: inline-flex;
        gap: 6px;
        align-items: baseline;
        padding: 3px 8px;
        background: var(--sc-bg);
        border: 1px solid var(--sc-border);
        border-radius: 6px;
        font-size: 12px;
        font-family: monospace;
        color: var(--sc-muted);

        b {
            color: var(--sc-text);
            font-size: 14px;
        }

        &--under10 {
            color: var(--sc-good);
            border-color: rgba(52, 211, 153, 0.45);
        }

        &--entry {
            color: var(--sc-accent);
            font-weight: 800;
            font-size: 14px;
        }
    }

    &__btn {
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-weight: 800;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;

        &:hover {
            filter: brightness(1.1);
        }

        @media (max-width: 720px) {
            padding: 10px 18px;
        }
    }

    /* ---- all-markets table ---- */
    &__section {
        margin: 26px 0 10px;
        font-size: 15px;
        font-weight: 700;
        color: var(--sc-text);
    }

    &__scroll {
        overflow-x: auto;
        border: 1px solid var(--sc-border);
        border-radius: 12px;
        -webkit-overflow-scrolling: touch;
    }

    &__table {
        width: 100%;
        border-collapse: collapse;
        background: var(--sc-surface);

        th,
        td {
            padding: 6px 8px;
            font-size: 12px;
            text-align: center;
            border-top: 1px solid var(--sc-border);
        }

        th {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
            background: var(--sc-surface-2);
            border-top: none;
        }

        th:first-child,
        td:first-child {
            text-align: left;
            position: sticky;
            left: 0;
            background: var(--sc-surface);
        }

        th:first-child {
            background: var(--sc-surface-2);
        }
    }

    &__tmarket {
        font-weight: 600;
        white-space: nowrap;
        color: var(--sc-text);
    }

    &__cell {
        font-family: monospace;
        color: var(--sc-muted);

        &--low {
            background: rgba(251, 191, 36, 0.14);
            color: var(--sc-warn);
            font-weight: 700;
        }

        &--strong {
            background: rgba(52, 211, 153, 0.2);
            color: var(--sc-good);
            font-weight: 800;
        }
    }

    &__note {
        margin: 18px 0 0;
        font-size: 12px;
        color: var(--sc-muted);
    }
}

@keyframes pps-sc-pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55);
    }
    70% {
        box-shadow: 0 0 0 8px rgba(52, 211, 153, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
    }
}

@keyframes pps-sc-shimmer {
    0% {
        background-position: 0% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
PPS_EOF

echo
echo "Done. Backups are in $B"
for f in src/styles/pps-theme.scss src/pages/entry-scanner/entry-scanner.scss src/pages/dashboard/landing.tsx src/pages/dashboard/landing.scss src/pages/dashboard/dashboard-pps.scss src/pages/dashboard/dashboard.tsx src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss; do
  [ -s "$f" ] && echo "OK  $f" || echo "MISSING $f"
done
