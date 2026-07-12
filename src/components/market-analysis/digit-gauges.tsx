import classNames from 'classnames';
import { TDigitStat } from '@/utils/digit-stats';
import './digit-gauges.scss';

type TDigitGaugesProps = {
    stats: TDigitStat[];
    current_digit: number | null;
};

const RADIUS = 26;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DigitGauges = ({ stats, current_digit }: TDigitGaugesProps) => {
    return (
        <div className='digit-gauges'>
            {stats.map(({ digit, percentage }) => {
                const is_current = digit === current_digit;
                const offset = CIRCUMFERENCE - (Math.min(percentage, 100) / 100) * CIRCUMFERENCE;
                return (
                    <div className='digit-gauges__item' key={digit}>
                        <svg
                            className={classNames('digit-gauges__ring', {
                                'digit-gauges__ring--current': is_current,
                            })}
                            width={(RADIUS + STROKE) * 2}
                            height={(RADIUS + STROKE) * 2}
                        >
                            <circle
                                className='digit-gauges__track'
                                cx={RADIUS + STROKE}
                                cy={RADIUS + STROKE}
                                r={RADIUS}
                                strokeWidth={STROKE}
                                fill='transparent'
                            />
                            <circle
                                className='digit-gauges__bar'
                                cx={RADIUS + STROKE}
                                cy={RADIUS + STROKE}
                                r={RADIUS}
                                strokeWidth={STROKE}
                                fill='transparent'
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={offset}
                                transform={`rotate(-90 ${RADIUS + STROKE} ${RADIUS + STROKE})`}
                            />
                            <text
                                x={RADIUS + STROKE}
                                y={RADIUS + STROKE - 3}
                                textAnchor='middle'
                                className='digit-gauges__digit'
                            >
                                {digit}
                            </text>
                            <text
                                x={RADIUS + STROKE}
                                y={RADIUS + STROKE + 12}
                                textAnchor='middle'
                                className='digit-gauges__pct'
                            >
                                {percentage.toFixed(1)}%
                            </text>
                        </svg>
                        {is_current && <span className='digit-gauges__marker'>▲</span>}
                    </div>
                );
            })}
        </div>
    );
};

export default DigitGauges;
