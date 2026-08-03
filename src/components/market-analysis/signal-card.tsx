import classNames from 'classnames';
import { useState } from 'react';
import { TSignal, TSignalStrength, TRiskLevel, TMarketHealth } from '@/utils/signal-engine';
import './signal-card.scss';

type TSignalCardProps = {
    title: string;
    market: string;
    signal: TSignal;
    onTrade?: (signal: TSignal) => void;
    onSave?: (signal: TSignal) => void;
    onShare?: (signal: TSignal) => void;
    onFavorite?: (signal: TSignal) => void;
};

const HEALTH_LABEL: Record<TMarketHealth, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    unstable: 'Unstable',
};

const HEALTH_ICON: Record<TMarketHealth, string> = {
    excellent: '🟢',
    good: '🔵',
    fair: '🟡',
    poor: '🟠',
    unstable: '🔴',
};

const STRENGTH_COLOR: Record<TSignalStrength, string> = {
    weak: 'var(--status-warning)',
    moderate: 'var(--brand-tertiary)',
    strong: 'var(--brand-success)',
    very_strong: 'var(--brand-primary)',
};

const RISK_COLOR: Record<TRiskLevel, string> = {
    low: 'var(--brand-success)',
    medium: 'var(--brand-warning)',
    high: 'var(--status-danger)',
    extreme: 'var(--brand-danger)',
};

const SignalCard = ({ title, market, signal, onTrade, onSave, onShare, onFavorite }: TSignalCardProps) => {
    const [showExplanation, setShowExplanation] = useState(false);
    const [isFavorited, setIsFavorited] = useState(false);
    const { label, confidence, strength, risk_level, reason, sample_size, contract_type, trade_score, expected_win_rate, recommended_stake, recommended_max_runs, expected_duration_seconds, signal_strength_index, market_state, ai_explanation, recovery } = signal;

    const is_actionable = confidence >= 70 && market_state.health !== 'unstable';

    const handleFavorite = () => {
        setIsFavorited(!isFavorited);
        onFavorite?.(signal);
    };

    return (
        <div className={classNames('pps-signal-card', {
            'pps-signal-card--active': is_actionable,
            'pps-signal-card--glass': true,
        })}>
            {/* Header */}
            <div className='pps-signal-card__header'>
                <div className='pps-signal-card__title-group'>
                    <span className='pps-signal-card__market'>{market}</span>
                    <h3 className='pps-signal-card__title'>{title}</h3>
                </div>
                <div className='pps-signal-card__header-actions'>
                    <button className='pps-signal-card__icon-btn' onClick={handleFavorite} title='Favorite'>
                        {isFavorited ? '⭐' : '☆'}
                    </button>
                    <button className='pps-signal-card__icon-btn' onClick={() => onShare?.(signal)} title='Share'>
                        ↗
                    </button>
                    <button className='pps-signal-card__icon-btn' onClick={() => onSave?.(signal)} title='Save'>
                        💾
                    </button>
                </div>
            </div>

            {/* Signal pick and confidence */}
            <div className='pps-signal-card__main'>
                <div className='pps-signal-card__pick'>
                    <span className='pps-signal-card__pick-label'>{label}</span>
                    <span className='pps-signal-card__pick-type'>{contract_type}</span>
                </div>
                <div className='pps-signal-card__confidence'>
                    <div className='pps-signal-card__confidence-track'>
                        <div
                            className='pps-signal-card__confidence-fill'
                            style={{
                                width: `${Math.max(4, confidence)}%`,
                                background: confidence >= 80 ? 'var(--brand-success)' : confidence >= 60 ? 'var(--brand-warning)' : 'var(--status-danger)',
                            }}
                        />
                    </div>
                    <span className='pps-signal-card__confidence-value'>{confidence.toFixed(0)}%</span>
                </div>
            </div>

            {/* Metrics grid */}
            <div className='pps-signal-card__metrics'>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Trade Score</span>
                    <span className='pps-signal-card__metric-value'>{trade_score.toFixed(0)}</span>
                </div>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Win Rate</span>
                    <span className='pps-signal-card__metric-value'>{expected_win_rate.toFixed(0)}%</span>
                </div>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Strength</span>
                    <span className='pps-signal-card__metric-value' style={{ color: STRENGTH_COLOR[strength] }}>{strength.replace('_', ' ')}</span>
                </div>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Risk</span>
                    <span className='pps-signal-card__metric-value' style={{ color: RISK_COLOR[risk_level] }}>{risk_level}</span>
                </div>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Stake</span>
                    <span className='pps-signal-card__metric-value'>${recommended_stake.toFixed(2)}</span>
                </div>
                <div className='pps-signal-card__metric'>
                    <span className='pps-signal-card__metric-label'>Max Runs</span>
                    <span className='pps-signal-card__metric-value'>{recommended_max_runs}</span>
                </div>
            </div>

            {/* Market health */}
            <div className='pps-signal-card__health'>
                <span className='pps-signal-card__health-icon'>{HEALTH_ICON[market_state.health]}</span>
                <span className='pps-signal-card__health-label'>Market Health: {HEALTH_LABEL[market_state.health]}</span>
                <span className='pps-signal-card__health-trend'>Trend: {market_state.trend}</span>
            </div>

            {/* AI Explanation toggle */}
            <button className='pps-signal-card__explanation-toggle' onClick={() => setShowExplanation(!showExplanation)}>
                <span>{showExplanation ? 'Hide' : 'Show'} AI Explanation</span>
                <span className='pps-signal-card__explanation-arrow'>{showExplanation ? '▲' : '▼'}</span>
            </button>

            {showExplanation && (
                <div className='pps-signal-card__explanation'>
                    <p className='pps-signal-card__reason'>{reason}</p>
                    <div className='pps-signal-card__ai-box'>
                        <strong>AI Analysis:</strong>
                        <p>{ai_explanation}</p>
                    </div>
                    {recovery && (
                        <div className='pps-signal-card__recovery'>
                            <strong>Recovery Status:</strong>
                            <p>{recovery.reasoning}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className='pps-signal-card__footer'>
                <div className='pps-signal-card__footer-item'>
                    <span className='pps-signal-card__footer-label'>Duration</span>
                    <span className='pps-signal-card__footer-value'>~{expected_duration_seconds}s</span>
                </div>
                <div className='pps-signal-card__footer-item'>
                    <span className='pps-signal-card__footer-label'>Sample</span>
                    <span className='pps-signal-card__footer-value'>{sample_size}</span>
                </div>
                <div className='pps-signal-card__footer-item'>
                    <span className='pps-signal-card__footer-label'>Signal IDX</span>
                    <span className='pps-signal-card__footer-value'>{signal_strength_index.toFixed(0)}</span>
                </div>
                {is_actionable && (
                    <button className='pps-signal-card__trade-btn' onClick={() => onTrade?.(signal)}>
                        Trade Now
                    </button>
                )}
            </div>
        </div>
    );
};

export default SignalCard;
