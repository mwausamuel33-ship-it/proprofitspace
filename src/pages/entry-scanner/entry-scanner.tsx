import { useState, useMemo } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useMultiMarketScanner } from '@/hooks/useMultiMarketScanner';
import { Localize } from '@deriv-com/translations';
import './entry-scanner.scss';

const SIGNAL_TYPES = ['DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER'] as const;
type TSignalType = typeof SIGNAL_TYPES[number];

const EntryScanner = observer(() => {
    const [signalType, setSignalType] = useState<TSignalType | 'all'>('all');
    const [confidenceThreshold, setConfidenceThreshold] = useState(70);
    const [minAiScore, setMinAiScore] = useState(50);
    const [maxRisk, setMaxRisk] = useState<'low' | 'medium' | 'high' | 'all'>('all');
    const [recoveryEnabled, setRecoveryEnabled] = useState(true);
    const [maxAnalyses, setMaxAnalyses] = useState(3);

    const { signals, is_scanning, last_scan } = useMultiMarketScanner({ interval_ms: 25000 });

    const formatTime = (epoch: number) => {
        const d = new Date(epoch);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const filteredSignals = useMemo(() => {
        return signals.filter(sig => {
            if (signalType !== 'all' && sig.contract_type !== signalType) return false;
            if ((sig.confidence || 0) < confidenceThreshold) return false;
            if ((sig.confidence || 0) < minAiScore) return false;
            return true;
        }).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }, [signals, signalType, confidenceThreshold, minAiScore]);

    return (
        <div className='pps-entry-scanner'>
            <div className='pps-entry-scanner__header'>
                <div>
                    <h2 className='pps-entry-scanner__title'>
                        <Localize i18n_default_text='Entry Scanner' />
                    </h2>
                    <p className='pps-entry-scanner__subtitle'>
                        <Localize i18n_default_text='Advanced filtering for high-confidence trading opportunities' />
                    </p>
                </div>
                <div className='pps-entry-scanner__status'>
                    {is_scanning && (
                        <span className='pps-entry-scanner__scanning-pill'>
                            <span className='pps-entry-scanner__scanning-dot' />
                            <Localize i18n_default_text='Scanning...' />
                        </span>
                    )}
                    {last_scan && (
                        <span className='pps-entry-scanner__last-scan'>
                            <Localize i18n_default_text='Last scan: {{time}}' values={{ time: formatTime(last_scan) }} />
                        </span>
                    )}
                </div>
            </div>

            <div className='pps-entry-scanner__filters glass'>
                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Signal Type' />
                    </label>
                    <select
                        className='pps-entry-scanner__select'
                        value={signalType}
                        onChange={e => setSignalType(e.target.value as TSignalType | 'all')}
                    >
                        <option value='all'>All Types</option>
                        {SIGNAL_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Min Confidence' />: {confidenceThreshold}%
                    </label>
                    <input
                        type='range'
                        min='50'
                        max='99'
                        value={confidenceThreshold}
                        onChange={e => setConfidenceThreshold(Number(e.target.value))}
                        className='pps-entry-scanner__range'
                    />
                </div>

                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Min AI Score' />: {minAiScore}
                    </label>
                    <input
                        type='range'
                        min='0'
                        max='100'
                        value={minAiScore}
                        onChange={e => setMinAiScore(Number(e.target.value))}
                        className='pps-entry-scanner__range'
                    />
                </div>

                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Max Risk' />
                    </label>
                    <select
                        className='pps-entry-scanner__select'
                        value={maxRisk}
                        onChange={e => setMaxRisk(e.target.value as 'low' | 'medium' | 'high' | 'all')}
                    >
                        <option value='all'>All</option>
                        <option value='low'>Low</option>
                        <option value='medium'>Medium</option>
                        <option value='high'>High</option>
                    </select>
                </div>

                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Recovery' />
                    </label>
                    <label className='pps-entry-scanner__toggle'>
                        <input
                            type='checkbox'
                            checked={recoveryEnabled}
                            onChange={e => setRecoveryEnabled(e.target.checked)}
                        />
                        <span className='pps-entry-scanner__toggle-slider'></span>
                    </label>
                </div>

                <div className='pps-entry-scanner__filter'>
                    <label className='pps-entry-scanner__filter-label'>
                        <Localize i18n_default_text='Max Analyses' />: {maxAnalyses}
                    </label>
                    <input
                        type='range'
                        min='1'
                        max='5'
                        value={maxAnalyses}
                        onChange={e => setMaxAnalyses(Number(e.target.value))}
                        className='pps-entry-scanner__range'
                    />
                </div>
            </div>

            <div className='pps-entry-scanner__results'>
                <div className='pps-entry-scanner__results-header'>
                    <h3 className='pps-entry-scanner__results-title'>
                        <Localize i18n_default_text='Filtered Opportunities' />
                    </h3>
                    <span className='pps-entry-scanner__results-count'>
                        {filteredSignals.length} {filteredSignals.length === 1 ? 'signal' : 'signals'}
                    </span>
                </div>

                {filteredSignals.length === 0 ? (
                    <div className='pps-entry-scanner__empty'>
                        <p>
                            <Localize i18n_default_text='No signals match your current filters. Try lowering the confidence threshold or widening the signal type selection.' />
                        </p>
                    </div>
                ) : (
                    <div className='pps-entry-scanner__grid'>
                        {filteredSignals.map((sig, idx) => (
                            <div key={`${sig.symbol}-${sig.contract_type}-${sig.barrier}-${idx}`} className='pps-entry-card glass'>
                                <div className='pps-entry-card__header'>
                                    <span className='pps-entry-card__rank'>#{idx + 1}</span>
                                    <span className='pps-entry-card__market'>{sig.display_name || sig.symbol}</span>
                                </div>
                                <div className='pps-entry-card__signal'>
                                    <span className={classNames('pps-entry-card__badge', {
                                        'pps-entry-card__badge--over': sig.contract_type === 'DIGITOVER',
                                        'pps-entry-card__badge--under': sig.contract_type === 'DIGITUNDER',
                                        'pps-entry-card__badge--even': sig.contract_type === 'DIGITEVEN',
                                        'pps-entry-card__badge--odd': sig.contract_type === 'DIGITODD',
                                    })}>
                                        {sig.contract_type === 'DIGITOVER' ? `Over ${sig.barrier}` :
                                         sig.contract_type === 'DIGITUNDER' ? `Under ${sig.barrier}` :
                                         sig.label}
                                    </span>
                                </div>
                                <div className='pps-entry-card__confidence'>
                                    <div className='pps-entry-card__confidence-bar'>
                                        <div
                                            className='pps-entry-card__confidence-fill'
                                            style={{
                                                width: `${Math.max(4, sig.confidence || 0)}%`,
                                                background: (sig.confidence || 0) >= 80 ? 'var(--brand-success)' : (sig.confidence || 0) >= 60 ? 'var(--brand-warning)' : 'var(--status-danger)',
                                            }}
                                        />
                                    </div>
                                    <span className='pps-entry-card__confidence-value'>{(sig.confidence || 0).toFixed(0)}%</span>
                                </div>
                                <div className='pps-entry-card__footer'>
                                    <span className='pps-entry-card__time'>{formatTime(sig.detected_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default EntryScanner;
