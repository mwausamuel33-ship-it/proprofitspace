import { Localize } from '@deriv-com/translations';
import './landing.scss';

type TLandingProps = { onLaunch: () => void };

const FEATURES = [
    {
        title: 'Scans every index',
        text: 'All Volatility, Volatility (1s) and Jump indices are checked every 20 seconds over their last 1000 ticks.',
    },
    {
        title: 'Rule-based signals',
        text: 'Digits 0, 1, 2 below 10.5% give Over 1 or 2. Digits 7, 8, 9 below 10.5% give Under 8 or 7.',
    },
    {
        title: 'Destroyer bot',
        text: 'One click loads the bot for that market with entry digits and a recovery step already set.',
    },
];

const Landing = ({ onLaunch }: TLandingProps) => (
    <div className='pps-landing'>
        <div className='pps-landing__glow' />
        <div className='pps-landing__inner'>
            <div className='pps-landing__brand'>
                <span className='pps-landing__logo'>P</span>
                <span>ProProfitSpace</span>
            </div>

            <h1 className='pps-landing__headline'>
                <Localize i18n_default_text='Scan every synthetic index. Load the right bot in one click.' />
            </h1>
            <p className='pps-landing__sub'>
                <Localize i18n_default_text='A digit-trading workspace for Deriv: a live market scanner, the Sammee Destroyer bot and a visual bot builder, all in one place.' />
            </p>

            <div className='pps-landing__actions'>
                <button className='pps-landing__cta' onClick={onLaunch}>
                    <Localize i18n_default_text='Launch app' />
                </button>
                <a
                    className='pps-landing__link'
                    href='#signal_scanner'
                    onClick={() => {
                        onLaunch();
                    }}
                >
                    <Localize i18n_default_text='Open the scanner' />
                </a>
            </div>

            <div className='pps-landing__grid'>
                {FEATURES.map(f => (
                    <div key={f.title} className='pps-landing__card'>
                        <h3>{f.title}</h3>
                        <p>{f.text}</p>
                    </div>
                ))}
            </div>

            <p className='pps-landing__risk'>
                Trading carries risk and past digit frequencies do not predict the next tick. Practise on a demo account first.
            </p>
        </div>
    </div>
);

export default Landing;
