import classNames from 'classnames';
import { TDigitStat } from '@/utils/digit-stats';
import './digit-circles.scss';

type TDigitCirclesProps = {
    stats: TDigitStat[];
    current_digit: number | null;
    most_frequent_digit: number | null;
    least_frequent_digit: number | null;
    size?: 'md' | 'sm';
};

const DigitCircles = ({
    stats,
    current_digit,
    most_frequent_digit,
    least_frequent_digit,
    size = 'md',
}: TDigitCirclesProps) => {
    return (
        <div className={classNames('digit-circles', `digit-circles--${size}`)}>
            {stats.map(({ digit, percentage, is_hot, is_cold, streak }) => {
                const is_current = digit === current_digit;
                const is_most = digit === most_frequent_digit;
                const is_least = digit === least_frequent_digit && !is_most;
                return (
                    <div
                        className={classNames('digit-circles__item', {
                            'digit-circles__item--hot': is_hot,
                            'digit-circles__item--cold': is_cold,
                        })}
                        key={digit}
                    >
                        <div
                            className={classNames('digit-circles__circle', {
                                'digit-circles__circle--current': is_current,
                                'digit-circles__circle--most': is_most,
                                'digit-circles__circle--least': is_least,
                            })}
                        >
                            <span className='digit-circles__digit'>{digit}</span>
                            <span className='digit-circles__pct'>{percentage.toFixed(1)}%</span>
                        </div>
                        {(is_most || is_least || is_current) && (
                            <span className='digit-circles__label'>
                                {is_most ? 'most' : is_least ? 'least' : 'current'}
                            </span>
                        )}
                        {streak > 0 && (
                            <span className='digit-circles__streak'>🔥{streak}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default DigitCircles;
