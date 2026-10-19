import { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import { DEFAULT_THRESHOLD } from '@/utils/destroyer-rules';
import { generateDestroyerBotXml } from '@/utils/signal-bot-xml';
import { load } from '@/external/bot-skeleton';
import { Localize } from '@deriv-com/translations';
import './signal-scanner.scss';

const LOSING_ZONE = [0, 1, 2, 7, 8, 9];

const SignalScanner = observer(() => {
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [stake, setStake] = useState(1);
    const [maxRuns, setMaxRuns] = useState(3);
    const { rows, signals, is_scanning, last_scan } = useDestroyerScanner({ threshold });

    const formatTime = (epoch: number) =>
        new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const handleLoadAndTrade = async (row: (typeof signals)[0]) => {
        const xmlString = generateDestroyerBotXml(row.signal, { symbol: row.symbol, stake, maxRuns });

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

    return (
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
                <div className='pps-sc__status'>
                    <span className={classNames('pps-sc__pill', { 'pps-sc__pill--live': is_scanning })}>
                        {is_scanning ? 'Scanning…' : 'Idle'}
                    </span>
                    {last_scan && <span className='pps-sc__time'>Last scan {formatTime(last_scan)}</span>}
                </div>
            </div>

            <div className='pps-sc__controls'>
                <label className='pps-sc__field'>
                    <span>Digit threshold (%)</span>
                    <input
                        type='number'
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
                        step='0.1'
                        min='0.35'
                        value={stake}
                        onChange={e => setStake(Number(e.target.value) || 1)}
                    />
                </label>
                <label className='pps-sc__field'>
                    <span>Max runs</span>
                    <input
                        type='number'
                        min='1'
                        max='20'
                        value={maxRuns}
                        onChange={e => setMaxRuns(Math.max(1, Number(e.target.value) || 3))}
                    />
                </label>
                <div className='pps-sc__summary'>
                    <strong>{signals.length}</strong> signals · <strong>{rows.length}</strong> markets scanned
                </div>
            </div>

            <div className='pps-sc__rules'>
                <div>
                    <b>Over</b> — 0,1 below threshold gives Over 1; 0,1,2 all below gives Over 2. Entry on digits 2, 5, 6.
                </div>
                <div>
                    <b>Under</b> — 9,8 below threshold gives Under 8; 9,8,7 all below gives Under 7. Entry on digits 4, 7,
                    9.
                </div>
            </div>

            <h3 className='pps-sc__section'>Signals</h3>
            {signals.length === 0 ? (
                <div className='pps-sc__empty'>
                    {rows.length === 0
                        ? 'Waiting for tick history from the first scan…'
                        : 'No market meets the rules right now. Try a lower threshold, or wait for the next scan.'}
                </div>
            ) : (
                <div className='pps-sc__scroll'>
                    <table className='pps-sc__table'>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Market</th>
                                <th>Signal</th>
                                <th>Losing digits</th>
                                <th>Entry digits</th>
                                <th>Scanned</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {signals.map((row, idx) => (
                                <tr key={row.symbol}>
                                    <td className='pps-sc__muted'>{idx + 1}</td>
                                    <td className='pps-sc__market'>{row.display_name}</td>
                                    <td>
                                        <span
                                            className={classNames('pps-sc__badge', {
                                                'pps-sc__badge--over': row.signal.side === 'over',
                                                'pps-sc__badge--under': row.signal.side === 'under',
                                            })}
                                        >
                                            {row.signal.label}
                                        </span>
                                    </td>
                                    <td>
                                        <div className='pps-sc__chips'>
                                            {row.signal.losingDigits.map(d => (
                                                <span key={d} className='pps-sc__chip'>
                                                    <b>{d}</b>
                                                    {row.digit_pct[d].toFixed(1)}%
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        <div className='pps-sc__chips'>
                                            {row.signal.entryDigits.map(d => (
                                                <span key={d} className='pps-sc__chip pps-sc__chip--entry'>
                                                    {d}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className='pps-sc__muted'>{formatTime(row.scanned_at)}</td>
                                    <td>
                                        <button className='pps-sc__btn' onClick={() => handleLoadAndTrade(row)}>
                                            Load &amp; Trade
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <h3 className='pps-sc__section'>All markets (last-digit %)</h3>
            <div className='pps-sc__scroll'>
                <table className='pps-sc__table pps-sc__table--dense'>
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
                                <td className='pps-sc__market'>{row.display_name}</td>
                                {row.digit_pct.map((pct, d) => (
                                    <td
                                        key={d}
                                        className={classNames('pps-sc__cell', {
                                            'pps-sc__cell--low': LOSING_ZONE.includes(d) && pct < threshold,
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
                Digit frequencies describe past ticks; they do not change the odds of the next tick. Test on a demo account
                first and keep stake and max runs small.
            </p>
        </div>
    );
});

export default SignalScanner;
