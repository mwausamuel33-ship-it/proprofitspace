import { LabelPairedChevronDownMdFillIcon } from '@deriv/quill-icons/LabelPaired';
import './market-select.scss';

type TMarket = { symbol: string; display_name: string };

type TMarketSelectProps = {
    markets: TMarket[];
    value: string;
    onChange: (symbol: string) => void;
    label?: string;
};

const MarketSelect = ({ markets, value, onChange, label = 'Select Market:' }: TMarketSelectProps) => {
    return (
        <div className='market-select'>
            {label && <label className='market-select__label'>{label}</label>}
            <div className='market-select__control'>
                <select
                    className='market-select__input'
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={!markets.length}
                >
                    {!markets.length && <option value=''>Loading markets…</option>}
                    {markets.map(market => (
                        <option key={market.symbol} value={market.symbol}>
                            {market.display_name}
                        </option>
                    ))}
                </select>
                <LabelPairedChevronDownMdFillIcon
                    height='16px'
                    width='16px'
                    fill='var(--text-general)'
                    className='market-select__chevron'
                />
            </div>
        </div>
    );
};

export default MarketSelect;
