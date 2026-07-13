import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import classNames from 'classnames';
import { useMultiMarketScanner } from '@/hooks/useMultiMarketScanner';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import './signal-scanner.scss';

const SignalScanner = observer(() => {
    const { signals, is_scanning, last_scan } = useMultiMarketScanner({ interval_ms: 25000 });
    const { quick_strategy } = useStore();

    const formatTime = (epoch: number) => {
        const d = new Date(epoch);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const handleLoadAndTrade = async (signal: typeof signals[0]) => {
        quick_strategy.setValue('symbol', signal.symbol);
        quick_strategy.setValue('tradetype', signal.contract_type);
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            quick_strategy.setValue('last_digit_prediction', String(signal.barrier));
        }
        quick_strategy.setFormVisibility(true);
        window.location.hash = 'bot_builder';
    };

    const signal_type_label = (sig: typeof signals[0]) => {
        if (sig.contract_type === 'DIGITOVER') return `Over ${sig.barrier}`;
        if (sig.contract_type === 'DIGITUNDER') return `Under ${sig.barrier}`;
        return sig.label;
    };

    return (
        <div className='signal-scanner'>
            <div className='signal-scanner__header'>
                <div>
                    <h2 className='signal-scanner__title'>
                        <Localize i18n_default_text='Signal Scanner' />
                    </h2>
                    <p className='signal-scanner__subtitle'>
                        <Localize i18n_default_text='Scanning Volatility and Jump indices for threshold signals' />
                    </p>
                </div>
                <div className='signal-scanner__status'>
                    {is_scanning && (
                        <span className='signal-scanner__scanning-pill'>
                            <Localize i18n_default_text='Scanning...' />
                        </span>
                    )}
                    {last_scan && (
                        <span className='signal-scanner__last-scan'>
                            <Localize i18n_default_text='Last scan: {{time}}' values={{ time: formatTime(last_scan) }} />
                        </span>
                    )}
                </div>
            </div>

            {signals.length === 0 ? (
                <div className='signal-scanner__empty'>
                    <p>
                        <Localize i18n_default_text='No signals detected yet. The scanner checks all Volatility and Jump indices every 25 seconds.' />
                    </p>
                </div>
            ) : (
                <div className='signal-scanner__table-wrapper'>
                    <table className='signal-scanner__table'>
                        <thead>
                            <tr>
                                <th><Localize i18n_default_text='Market' /></th>
                                <th><Localize i18n_default_text='Signal' /></th>
                                <th><Localize i18n_default_text='Triggering Digits' /></th>
                                <th><Localize i18n_default_text='Detected At' /></th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {signals.map((sig, idx) => (
                                <tr key={`${sig.symbol}-${sig.contract_type}-${sig.barrier}-${idx}`}>
                                    <td className='signal-scanner__cell-market'>{sig.display_name || sig.symbol}</td>
                                    <td>
                                        <span className={classNames('signal-scanner__signal-badge', {
                                            'signal-scanner__signal-badge--over': sig.contract_type === 'DIGITOVER',
                                            'signal-scanner__signal-badge--under': sig.contract_type === 'DIGITUNDER',
                                            'signal-scanner__signal-badge--even': sig.contract_type === 'DIGITEVEN',
                                            'signal-scanner__signal-badge--odd': sig.contract_type === 'DIGITODD',
                                        })}>
                                            {signal_type_label(sig)}
                                        </span>
                                    </td>
                                    <td className='signal-scanner__cell-digits'>
                                        {sig.triggering_digits ? (
                                            <div className='signal-scanner__digit-list'>
                                                {sig.triggering_digits.map(td => (
                                                    <span key={td.digit} className='signal-scanner__digit-item'>
                                                        <span className='signal-scanner__digit-value'>{td.digit}</span>
                                                        <span className='signal-scanner__digit-pct'>{td.percentage.toFixed(1)}%</span>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className='signal-scanner__confidence'>{sig.confidence.toFixed(0)}% confidence</span>
                                        )}
                                    </td>
                                    <td className='signal-scanner__cell-time'>{formatTime(sig.detected_at)}</td>
                                    <td>
                                        <button
                                            className='dc-btn dc-btn--primary signal-scanner__trade-btn'
                                            onClick={() => handleLoadAndTrade(sig)}
                                        >
                                            <Localize i18n_default_text='Load & Trade' />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});

export default SignalScanner;
