import classNames from 'classnames';
import { TTrackedSignal } from '@/hooks/useSignalEngine';
import { Localize } from '@deriv-com/translations';
import './signal-card.scss';

type TSignalCardProps = {
    title: string;
    signal: TTrackedSignal;
    suggested_stake: number;
    currency: string;
    avg_interval_seconds: number | null;
};

const STATUS_LABEL: Record<TTrackedSignal['status'], string> = {
    collecting: 'Collecting data',
    forming: 'Forming',
    active: 'Active',
};

const SignalCard = ({ title, signal, suggested_stake, currency, avg_interval_seconds }: TSignalCardProps) => {
    const { label, confidence, strength, risk_level, status, stable_ticks, reason, sample_size, contract_type } =
        signal;
    const is_actionable = status === 'active';

    return (
        <div className={classNames('signal-card', `signal-card--${status}`)}>
            <div className='signal-card__header'>
                <span className='signal-card__title'>{title}</span>
                <span className={classNames('signal-card__status-pill', `signal-card__status-pill--${status}`)}>
                    {STATUS_LABEL[status]}
                </span>
            </div>

            <div className='signal-card__main'>
                <div className='signal-card__pick'>
                    <span className='signal-card__pick-label'>{label}</span>
                    <span className='signal-card__pick-type'>{contract_type}</span>
                </div>

                <div className='signal-card__confidence'>
                    <div className='signal-card__confidence-track'>
                        <div
                            className={classNames('signal-card__confidence-fill', `signal-card__confidence-fill--${risk_level}`)}
                            style={{ width: `${Math.max(4, confidence)}%` }}
                        />
                    </div>
                    <span className='signal-card__confidence-value'>{confidence.toFixed(0)}%</span>
                </div>
            </div>

            <div className='signal-card__badges'>
                <span className={classNames('signal-card__badge', `signal-card__badge--strength-${strength}`)}>
                    <Localize i18n_default_text='Strength: {{strength}}' values={{ strength }} />
                </span>
                <span className={classNames('signal-card__badge', `signal-card__badge--risk-${risk_level}`)}>
                    <Localize i18n_default_text='Risk: {{risk_level}}' values={{ risk_level }} />
                </span>
                <span className='signal-card__badge signal-card__badge--neutral'>
                    <Localize i18n_default_text='Stable {{count}} ticks' values={{ count: stable_ticks }} />
                </span>
            </div>

            <p className='signal-card__reason'>{reason}</p>

            <div className='signal-card__footer'>
                <div className='signal-card__footer-item'>
                    <span className='signal-card__footer-label'>
                        <Localize i18n_default_text='Suggested stake' />
                    </span>
                    <span className='signal-card__footer-value'>
                        {is_actionable ? `${suggested_stake.toFixed(2)} ${currency}` : '—'}
                    </span>
                </div>
                <div className='signal-card__footer-item'>
                    <span className='signal-card__footer-label'>
                        <Localize i18n_default_text='Contract duration' />
                    </span>
                    <span className='signal-card__footer-value'>
                        <Localize i18n_default_text='1 tick' />
                    </span>
                </div>
                <div className='signal-card__footer-item'>
                    <span className='signal-card__footer-label'>
                        <Localize i18n_default_text='Next tick in' />
                    </span>
                    <span className='signal-card__footer-value'>
                        {avg_interval_seconds ? `~${avg_interval_seconds}s` : '—'}
                    </span>
                </div>
                <div className='signal-card__footer-item'>
                    <span className='signal-card__footer-label'>
                        <Localize i18n_default_text='Sample size' />
                    </span>
                    <span className='signal-card__footer-value'>{sample_size}</span>
                </div>
            </div>
        </div>
    );
};

export default SignalCard;
