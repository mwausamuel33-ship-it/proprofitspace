import './landing.scss';

type TLandingProps = { onLaunch: () => void };

const NAV = [
    { id: 'pps-landing-how', label: 'How it works' },
    { id: 'pps-landing-rules', label: 'The rules' },
    { id: 'pps-landing-limits', label: 'Safeguards' },
];

const STEPS = [
    {
        title: 'Scan',
        text: 'Every Volatility index is read over its last 1,000 ticks and refreshed every 20 seconds.',
    },
    {
        title: 'Qualify',
        text: 'A market passes only if its losing digits run below 10%, at least two winning digits sit at 11% or more, and the most frequent digits are on the winning side.',
    },
    {
        title: 'Time the entry',
        text: 'The bot waits for a trigger digit, then trades only if a confirming digit lands within two ticks.',
    },
    {
        title: 'Recover and stop',
        text: 'After a loss it steps up with a capped martingale. It stops at your take profit, stop loss or run limit.',
    },
];

const SAMPLE = [
    { market: 'Volatility 75 (1s) Index', setup: 'Over 3', entry: '1 → 4-8', digits: '0 8.6 · 1 9.1 · 2 9.4 · 3 9.7' },
    { market: 'Volatility 25 (1s) Index', setup: 'Under 6', entry: '8 → 1-5', digits: '9 8.8 · 8 9.3 · 7 9.6 · 6 9.9' },
    { market: 'Volatility 50 Index', setup: 'Over 2', entry: '2 → 4-8', digits: '0 9.0 · 1 9.5 · 2 9.8' },
];

const OVER_RULES = [
    'Over 3 needs digits 0 to 3 each below 10%. Over 2 needs 0 to 2, Over 1 needs 0 and 1.',
    'At least two of digits 4 to 9 at 11% or more, or 10.7% and still rising.',
    'The most and second most frequent digits must both sit in 4 to 9.',
    'Trigger: the least frequent of 1, 2 and 3. Confirm: a digit from 4 to 8 within two ticks.',
    'Digits 0 and 9 are never a trigger or a confirmation.',
];

const UNDER_RULES = [
    'Under 6 needs digits 9 to 6 each below 10%. Under 7 needs 9 to 7, Under 8 needs 9 and 8.',
    'At least two of digits 0 to 5 at 11% or more, or 10.7% and still rising.',
    'The most and second most frequent digits must both sit in 0 to 5.',
    'Trigger: the least frequent of 8, 7 and 6. Confirm: a digit from 1 to 5 within two ticks.',
    'Digits 0 and 9 are never a trigger or a confirmation.',
];

const LIMITS = [
    { title: 'Take profit and stop loss', text: 'Every bot carries both, set from your stake and editable before you run it.' },
    { title: 'Capped recovery', text: 'Martingale is limited to two recovery trades by default, then the bot resets instead of chasing.' },
    { title: 'Run limit', text: 'A bot ends after the number of cycles you choose, so it never trades unattended without end.' },
    { title: 'Demo first', text: 'Run it on a demo account and watch several sessions before you use real money.' },
];

const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const Landing = ({ onLaunch }: TLandingProps) => (
    <div className='pps-landing'>
        <header className='pps-landing__header'>
            <div className='pps-landing__wrap pps-landing__header-row'>
                <div className='pps-landing__brand'>
                    <span className='pps-landing__mark' aria-hidden='true'>
                        P
                    </span>
                    ProProfitSpace
                </div>
                <nav className='pps-landing__nav' aria-label='Sections'>
                    {NAV.map(item => (
                        <button key={item.id} className='pps-landing__nav-link' onClick={() => scrollToSection(item.id)}>
                            {item.label}
                        </button>
                    ))}
                </nav>
                <button className='pps-landing__button' onClick={onLaunch}>
                    Launch app
                </button>
            </div>
        </header>

        <main>
            <section className='pps-landing__wrap pps-landing__hero'>
                <div className='pps-landing__hero-copy'>
                    <p className='pps-landing__eyebrow'>Digit trading workspace for Deriv</p>
                    <h1 className='pps-landing__title'>Find the digit setups worth trading. Skip the rest.</h1>
                    <p className='pps-landing__lead'>
                        ProProfitSpace scans every Volatility index, checks each one against a written rule set, and loads
                        a bot that already knows its entry, its recovery and its limits.
                    </p>
                    <div className='pps-landing__actions'>
                        <button className='pps-landing__button pps-landing__button--large' onClick={onLaunch}>
                            Launch app
                        </button>
                        <a className='pps-landing__text-link' href='#signal_scanner' onClick={onLaunch}>
                            Open the scanner
                        </a>
                    </div>
                </div>

                <div className='pps-landing__panel' role='group' aria-label='Example of the scanner'>
                    <div className='pps-landing__panel-head'>
                        <span>Signal scanner</span>
                        <span className='pps-landing__panel-note'>Example data, not a live signal</span>
                    </div>
                    <div className='pps-landing__table-wrap'>
                        <table className='pps-landing__table'>
                            <thead>
                                <tr>
                                    <th scope='col'>Market</th>
                                    <th scope='col'>Setup</th>
                                    <th scope='col'>Trigger → confirm</th>
                                    <th scope='col'>Losing digits %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SAMPLE.map(row => (
                                    <tr key={row.market}>
                                        <td>{row.market}</td>
                                        <td className='pps-landing__setup'>{row.setup}</td>
                                        <td className='pps-landing__mono'>{row.entry}</td>
                                        <td className='pps-landing__mono'>{row.digits}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section id='pps-landing-how' className='pps-landing__section'>
                <div className='pps-landing__wrap'>
                    <h2 className='pps-landing__h2'>How it works</h2>
                    <ol className='pps-landing__steps'>
                        {STEPS.map((step, index) => (
                            <li key={step.title} className='pps-landing__step'>
                                <span className='pps-landing__step-number'>{String(index + 1).padStart(2, '0')}</span>
                                <h3>{step.title}</h3>
                                <p>{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section id='pps-landing-rules' className='pps-landing__section'>
                <div className='pps-landing__wrap'>
                    <h2 className='pps-landing__h2'>The rules, written down</h2>
                    <p className='pps-landing__section-lead'>
                        No score you cannot inspect. Under is the exact mirror of Over, with every digit flipped.
                    </p>
                    <div className='pps-landing__rules'>
                        <div className='pps-landing__rule-box'>
                            <h3>Over 1, 2 and 3</h3>
                            <ul>
                                {OVER_RULES.map(rule => (
                                    <li key={rule}>{rule}</li>
                                ))}
                            </ul>
                        </div>
                        <div className='pps-landing__rule-box'>
                            <h3>Under 8, 7 and 6</h3>
                            <ul>
                                {UNDER_RULES.map(rule => (
                                    <li key={rule}>{rule}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section id='pps-landing-limits' className='pps-landing__section'>
                <div className='pps-landing__wrap'>
                    <h2 className='pps-landing__h2'>Safeguards built into every bot</h2>
                    <dl className='pps-landing__limits'>
                        {LIMITS.map(item => (
                            <div key={item.title} className='pps-landing__limit'>
                                <dt>{item.title}</dt>
                                <dd>{item.text}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section className='pps-landing__section pps-landing__band'>
                <div className='pps-landing__wrap pps-landing__band-row'>
                    <h2 className='pps-landing__band-title'>Start on a demo account.</h2>
                    <button className='pps-landing__button pps-landing__button--large' onClick={onLaunch}>
                        Launch app
                    </button>
                </div>
            </section>
        </main>

        <footer className='pps-landing__footer'>
            <div className='pps-landing__wrap'>
                <p className='pps-landing__risk'>
                    Trading digit contracts carries a high level of risk and you can lose your entire stake. Digits are
                    random: percentages describe the past and do not predict the next tick. No scanner, setup or bot
                    guarantees a profit. Trades are placed through your own Deriv account. Practise on a demo account
                    first.
                </p>
                <p className='pps-landing__copy'>ProProfitSpace</p>
            </div>
        </footer>
    </div>
);

export default Landing;
