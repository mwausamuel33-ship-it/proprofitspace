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
        quick_strategy.setSelectedStrategy('SIGNAL_MARTINGALE');
        quick_strategy.setValue('symbol', signal.symbol);
        quick_strategy.setValue('market', 'synthetic_index');
        quick_strategy.setValue('submarket', 'random_index');
        quick_strategy.setValue('tradetypecat', 'digits');
        quick_strategy.setValue('tradetype', signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER' ? 'overunder' : 'evenodd');
        quick_strategy.setValue('type', signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER' ? 'overunder' : 'evenodd');
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            quick_strategy.setValue('last_digit_prediction', String(signal.barrier));
        }
        quick_strategy.setFormVisibility(true);
        window.location.hash = 'bot_builder';

        setTimeout(() => {
            const form = document.querySelector('.qs__form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }, 800);
    };

    const signal_type_label = (sig: typeof signals[0]) => {
        if (sig.contract_type === 'DIGITOVER') return `Over ${sig.barrier}`;
        if (sig.contract_type === 'DIGITUNDER') return `Under ${sig.barrier}`;
        return sig.label;
    };

    // Sort signals by confidence (highest first)
    const sorted_signals = [...signals].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return (
        <div className='pps-signal-scanner'>
            <div className='pps-signal-scanner__header'>
                <div>
                    <h2 className='pps-signal-scanner__title'>
                        <Localize i18n_default_text='Live Market Scanner' />
                    </h2>
                    <p className='pps-signal-scanner__subtitle'>
                        <Localize i18n_default_text='Continuously ranking all synthetic indices by opportunity strength' />
                    </p>
                </div>
                <div className='pps-signal-scanner__status'>
                    {is_scanning && (
                        <span className='pps-signal-scanner__scanning-pill'>
                            <span className='pps-signal-scanner__scanning-dot' />
                            <Localize i18n_default_text='Scanning...' />
                        </span>
                    )}
                    {last_scan && (
                        <span className='pps-signal-scanner__last-scan'>
                            <Localize i18n_default_text='Last scan: {{time}}' values={{ time: formatTime(last_scan) }} />
                        </span>
                    )}
                </div>
            </div>

            {sorted_signals.length === 0 ? (
                <div className='pps-signal-scanner__empty'>
                    <div className='pps-signal-scanner__empty-icon'>🔍</div>
                    <p>
                        <Localize i18n_default_text='No signals detected yet. The scanner checks all Volatility and Jump indices every 25 seconds.' />
                    </p>
                </div>
            ) : (
                <div className='pps-signal-scanner__table-wrapper'>
                    <table className='pps-signal-scanner__table'>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th><Localize i18n_default_text='Market' /></th>
                                <th><Localize i18n_default_text='Signal' /></th>
                                <th><Localize i18n_default_text='Confidence' /></th>
                                <th><Localize i18n_default_text='Triggering Digits' /></th>
                                <th><Localize i18n_default_text='Detected At' /></th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted_signals.map((sig, idx) => (
                                <tr key={`${sig.symbol}-${sig.contract_type}-${sig.barrier}-${idx}`}>
                                    <td className='pps-signal-scanner__cell-rank'>{idx + 1}</td>
                                    <td className='pps-signal-scanner__cell-market'>{sig.display_name || sig.symbol}</td>
                                    <td>
                                        <span className={classNames('pps-signal-scanner__signal-badge', {
                                            'pps-signal-scanner__signal-badge--over': sig.contract_type === 'DIGITOVER',
                                            'pps-signal-scanner__signal-badge--under': sig.contract_type === 'DIGITUNDER',
                                            'pps-signal-scanner__signal-badge--even': sig.contract_type === 'DIGITEVEN',
                                            'pps-signal-scanner__signal-badge--odd': sig.contract_type === 'DIGITODD',
                                        })}>
                                            {signal_type_label(sig)}
                                        </span>
                                    </td>
                                    <td className='pps-signal-scanner__cell-confidence'>
                                        <div className='pps-signal-scanner__confidence-bar'>
                                            <div
                                                className='pps-signal-scanner__confidence-fill'
                                                style={{
                                                    width: `${Math.max(4, sig.confidence || 0)}%`,
                                                    background: (sig.confidence || 0) >= 80 ? 'var(--brand-success)' : (sig.confidence || 0) >= 60 ? 'var(--brand-warning)' : 'var(--status-danger)',
                                                }}
                                            />
                                        </div>
                                        <span className='pps-signal-scanner__confidence-value'>{(sig.confidence || 0).toFixed(0)}%</span>
                                    </td>
                                    <td className='pps-signal-scanner__cell-digits'>
                                        {sig.triggering_digits ? (
                                            <div className='pps-signal-scanner__digit-list'>
                                                {sig.triggering_digits.map(td => (
                                                    <span key={td.digit} className='pps-signal-scanner__digit-item'>
                                                        <span className='pps-signal-scanner__digit-value'>{td.digit}</span>
                                                        <span className='pps-signal-scanner__digit-pct'>{td.percentage.toFixed(1)}%</span>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className='pps-signal-scanner__confidence'>{(sig.confidence || 0).toFixed(0)}% confidence</span>
                                        )}
                                    </td>
                                    <td className='pps-signal-scanner__cell-time'>{formatTime(sig.detected_at)}</td>
                                    <td>
                                        <button
                                            className='pps-signal-scanner__trade-btn'
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
