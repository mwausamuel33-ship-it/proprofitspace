import { useMemo, useState } from 'react';
import { LabelPairedCheckCaptionFillIcon, LabelPairedSearchCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { DBOT_TABS } from '@/constants/bot-contents';
import { localize } from '@deriv-com/translations';
import { PREMIUM_BOTS } from './data';
import './trading-bots.scss';

type TTradingBotsProps = {
    handleTabChange: (tab: number) => void;
};

const TradingBots = ({ handleTabChange }: TTradingBotsProps) => {
    const [search, setSearch] = useState('');
    const [note, setNote] = useState('');

    const filtered_bots = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return PREMIUM_BOTS;
        return PREMIUM_BOTS.filter(
            bot => bot.name.toLowerCase().includes(query) || bot.description.toLowerCase().includes(query)
        );
    }, [search]);

    const handleLoad = (bot_name: string) => {
        setNote(
            localize('{{bot_name}} is a showcase strategy. Opening Bot Builder — import its .xml file there to load it.', {
                bot_name,
            })
        );
        handleTabChange(DBOT_TABS.BOT_BUILDER);
    };

    return (
        <div className='trading-bots'>
            <div className='trading-bots__search'>
                <LabelPairedSearchCaptionRegularIcon height='16px' width='16px' fill='var(--text-less-prominent)' />
                <input
                    className='trading-bots__search-input'
                    type='text'
                    placeholder={localize('Search bots...')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {note && <div className='trading-bots__note'>{note}</div>}

            <div className='trading-bots__grid'>
                {filtered_bots.map(bot => (
                    <div className='trading-bots__card' key={bot.id}>
                        <div className='trading-bots__badge'>{localize('PREMIUM')}</div>
                        <div className='trading-bots__card-header'>
                            <span className='trading-bots__icon' aria-hidden='true'>
                                🤖
                            </span>
                            <h3 className='trading-bots__name'>{bot.name}</h3>
                        </div>
                        <div className='trading-bots__rating'>
                            {Array.from({ length: bot.rating }).map((_, i) => (
                                <LabelPairedCheckCaptionFillIcon
                                    key={i}
                                    height='12px'
                                    width='12px'
                                    fill='var(--status-warning)'
                                />
                            ))}
                        </div>
                        <p className='trading-bots__description'>{bot.description}</p>
                        <button className='trading-bots__load-button' onClick={() => handleLoad(bot.name)}>
                            {localize('LOAD PREMIUM BOT')}
                        </button>
                    </div>
                ))}
                {!filtered_bots.length && (
                    <div className='trading-bots__empty'>{localize('No bots match your search.')}</div>
                )}
            </div>
        </div>
    );
};

export default TradingBots;
