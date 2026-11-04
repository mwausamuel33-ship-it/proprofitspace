import { useMemo, useState } from 'react';
import { LabelPairedCheckCaptionFillIcon, LabelPairedSearchCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { DBOT_TABS } from '@/constants/bot-contents';
import { localize } from '@deriv-com/translations';
import { load } from '@/external/bot-skeleton';
import '@/styles/pps-theme.scss';
import { PREMIUM_BOTS } from './data';
import { NEW_BOTS, TStoreBot } from './new-bots';
import './trading-bots.scss';

type TTradingBotsProps = {
    handleTabChange: (tab: number) => void;
};

type TCategory = 'all' | 'digit' | 'recovery' | 'hedge' | 'other';

const ICONS: Record<Exclude<TCategory, 'all'>, string> = {
    digit: '🎯',
    recovery: '🔁',
    hedge: '🛡️',
    other: '🤖',
};

const categoryOf = (bot: TStoreBot): Exclude<TCategory, 'all'> => {
    const n = bot.name.toLowerCase();
    if (n.includes('hedge')) return 'hedge';
    if (n.includes('recovery') || n.includes('alternate') || n.includes('cycle')) return 'recovery';
    if (n.includes('over') || n.includes('under') || n.includes('digit') || n.includes('destroyer')) return 'digit';
    return 'other';
};

const TradingBots = ({ handleTabChange }: TTradingBotsProps) => {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<TCategory>('all');
    const [note, setNote] = useState('');
    const [loading_id, setLoadingId] = useState<string | null>(null);

    const all_bots = useMemo<TStoreBot[]>(() => [...NEW_BOTS, ...PREMIUM_BOTS], []);

    const filtered_bots = useMemo(() => {
        const query = search.trim().toLowerCase();
        return all_bots.filter(
            bot =>
                (category === 'all' || categoryOf(bot) === category) &&
                (!query || bot.name.toLowerCase().includes(query) || bot.description.toLowerCase().includes(query))
        );
    }, [all_bots, search, category]);

    const categories: { id: TCategory; label: string }[] = [
        { id: 'all', label: localize('All') },
        { id: 'digit', label: localize('Digit bots') },
        { id: 'recovery', label: localize('Recovery') },
        { id: 'hedge', label: localize('Hedge') },
        { id: 'other', label: localize('Other') },
    ];

    const handleLoad = async (bot: TStoreBot) => {
        if (!bot.xml) {
            setNote(
                localize('{{bot_name}} is a showcase strategy. Opening Bot Builder — import its .xml file there to load it.', {
                    bot_name: bot.name,
                })
            );
            handleTabChange(DBOT_TABS.BOT_BUILDER);
            return;
        }
        setLoadingId(bot.id);
        handleTabChange(DBOT_TABS.BOT_BUILDER);
        try {
            let workspace = window.Blockly?.derivWorkspace;
            for (let i = 0; i < 80 && !workspace; i++) {
                await new Promise(resolve => setTimeout(resolve, 125));
                workspace = window.Blockly?.derivWorkspace;
            }
            if (!workspace) throw new Error(localize('The Bot Builder workspace did not open.'));
            const xml = await bot.xml();
            await load({
                block_string: xml,
                file_name: bot.name,
                strategy_id: null,
                workspace,
                from: 'trading_bots',
                drop_event: {},
                showIncompatibleStrategyDialog: false,
                show_snackbar: true,
            });
            workspace.strategy_to_load = xml;
            setNote(localize('{{bot_name}} is loaded in Bot Builder. Check the settings, then press Run.', { bot_name: bot.name }));
        } catch (e) {
            setNote((e as Error).message);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className='trading-bots'>
            <div className='trading-bots__hero'>
                <h2 className='trading-bots__title'>{localize('Trading Bots')}</h2>
                <p className='trading-bots__subtitle'>
                    {localize('Ready-to-run bots with built-in recovery, take profit and stop loss. Test on demo first.')}
                </p>
                <span className='trading-bots__count'>
                    {all_bots.length} {localize('bots available')}
                </span>
            </div>

            <div className='trading-bots__toolbar'>
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
                <div className='trading-bots__tabs' role='tablist'>
                    {categories.map(c => (
                        <button
                            key={c.id}
                            role='tab'
                            aria-selected={category === c.id}
                            className={`trading-bots__tab${category === c.id ? ' is-active' : ''}`}
                            onClick={() => setCategory(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            {note && <div className='trading-bots__note'>{note}</div>}

            <div className='trading-bots__grid'>
                {filtered_bots.map((bot, index) => (
                    <div
                        className={`trading-bots__card${bot.is_new ? ' is-new' : ''}`}
                        key={bot.id}
                        style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                    >
                        <div className='trading-bots__badges'>
                            {bot.is_new && <span className='trading-bots__badge trading-bots__badge--new'>{localize('NEW')}</span>}
                            <span className='trading-bots__badge'>{localize('PREMIUM')}</span>
                        </div>
                        <div className='trading-bots__card-header'>
                            <span className='trading-bots__icon' aria-hidden='true'>
                                {ICONS[categoryOf(bot)]}
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
                        <button
                            className='trading-bots__load-button'
                            onClick={() => handleLoad(bot)}
                            disabled={loading_id === bot.id}
                        >
                            {loading_id === bot.id ? localize('LOADING...') : localize('LOAD PREMIUM BOT')}
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
