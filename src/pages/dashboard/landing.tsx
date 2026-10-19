import { Localize } from '@deriv-com/translations';
import './landing.scss';

type TLandingProps = { onLaunch: () => void };

const FEATURES = [
    {
        icon: '◎',
        title: 'Scans every index',
        text: 'All Volatility and Volatility (1s) indices are checked over their last 1000 ticks.',
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
    { market: 'Volatility 25 (1s) Index', badge: 'Under 8', side: 'under', stars: 2, digits: '8 9.4% · 9 9.8%', entry: '4 7 9' },
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
