import { useEffect, useMemo, useState } from 'react';
import { DBOT_TABS } from '@/constants/bot-contents';
import { localize } from '@deriv-com/translations';
import { load } from '@/external/bot-skeleton';
import { getAnalysedMarket, withMarket } from '@/utils/analysed-market';
import { cleanBotXml } from '@/utils/clean-bot-xml';
import { PREMIUM_BOTS } from './data';
import { NEW_BOTS, TStoreBot } from './new-bots';
import { CATEGORY_LABELS, categoryOf, collapseVersions, isScratchBot, TCategory } from './store-utils';
import './trading-bots.scss';

type TTradingBotsProps = {
    handleTabChange: (tab: number) => void;
};

const PAGE_SIZE = 24;
// Cards that have no bot file behind them are placeholders. Set to true to list them anyway.
const SHOW_PLACEHOLDERS = false;
// The store lists the current bots. Set SHOW_OLD_BOTS to true to list the earlier imports too.
const SHOW_BOTS = true;
const SHOW_OLD_BOTS = false;

const TradingBots = ({ handleTabChange }: TTradingBotsProps) => {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<TCategory>('all');
    const [show_versions, setShowVersions] = useState(false);
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [note, setNote] = useState('');
    const [loading_id, setLoadingId] = useState<string | null>(null);

    // new bots first, scratch files and placeholders out, then one card per bot (newest version)
    const { listed, versions, hidden_versions } = useMemo(() => {
        const all: TStoreBot[] = (SHOW_BOTS ? [...NEW_BOTS, ...(SHOW_OLD_BOTS ? PREMIUM_BOTS : [])] : []).filter(
            bot => (SHOW_PLACEHOLDERS || bot.xml) && !isScratchBot(bot)
        );
        if (show_versions) return { listed: all, versions: {} as Record<string, number>, hidden_versions: 0 };
        const { shown, versions: counts } = collapseVersions(all);
        return { listed: shown, versions: counts, hidden_versions: all.length - shown.length };
    }, [show_versions]);

    const category_counts = useMemo(() => {
        const counts: Partial<Record<TCategory, number>> = {};
        listed.forEach(bot => {
            const c = categoryOf(bot);
            counts[c] = (counts[c] ?? 0) + 1;
        });
        return counts;
    }, [listed]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return listed.filter(
            bot =>
                (category === 'all' || categoryOf(bot) === category) &&
                (!query || bot.name.toLowerCase().includes(query) || bot.description.toLowerCase().includes(query))
        );
    }, [listed, search, category]);

    useEffect(() => setLimit(PAGE_SIZE), [search, category, show_versions]);

    const tabs: { id: TCategory; label: string }[] = [
        { id: 'all', label: localize('All') },
        ...(Object.keys(CATEGORY_LABELS) as Exclude<TCategory, 'all'>[])
            .filter(id => category_counts[id])
            .map(id => ({ id, label: CATEGORY_LABELS[id] })),
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
            const raw_xml = await bot.xml();
            const xml = cleanBotXml(bot.follow_market ? withMarket(raw_xml, getAnalysedMarket()) : raw_xml);
            await load({
                block_string: xml,
                file_name: bot.name,
                strategy_id: `pps-store-${bot.id}`,
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

    if (!listed.length) {
        return (
            <div className='trading-bots'>
                <div className='trading-bots__hero'>
                    <h2 className='trading-bots__title'>{localize('Trading Bots')}</h2>
                    <p className='trading-bots__subtitle'>{localize('There are no bots in the store right now.')}</p>
                </div>
                <div className='trading-bots__empty'>
                    <p>{localize('Build your own in Bot Builder, or import an XML file from the Dashboard.')}</p>
                </div>
                <button type='button' className='trading-bots__more' onClick={() => handleTabChange(DBOT_TABS.BOT_BUILDER)}>
                    {localize('Open Bot Builder')}
                </button>
            </div>
        );
    }

    const visible = filtered.slice(0, limit);

    return (
        <div className='trading-bots'>
            <div className='trading-bots__hero'>
                <h2 className='trading-bots__title'>{localize('Trading Bots')}</h2>
                <p className='trading-bots__subtitle'>
                    {localize('Every bot has take profit and stop loss. Test on a demo account first.')}
                </p>
            </div>

            <div className='trading-bots__toolbar'>
                <input
                    className='trading-bots__search'
                    type='search'
                    placeholder={localize('Search bots...')}
                    aria-label={localize('Search bots')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className='trading-bots__tabs' role='tablist'>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            role='tab'
                            aria-selected={category === tab.id}
                            className={`trading-bots__tab${category === tab.id ? ' is-active' : ''}`}
                            onClick={() => setCategory(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className='trading-bots__status'>
                <span>
                    {filtered.length} {filtered.length === 1 ? localize('bot') : localize('bots')}
                </span>
                {(hidden_versions > 0 || show_versions) && (
                    <button type='button' className='trading-bots__text-button' onClick={() => setShowVersions(v => !v)}>
                        {show_versions
                            ? localize('Show newest versions only')
                            : `${localize('Show all versions')} (${hidden_versions} ${localize('hidden')})`}
                    </button>
                )}
            </div>

            {note && (
                <div className='trading-bots__note' role='status'>
                    {note}
                </div>
            )}

            <div className='trading-bots__grid'>
                {visible.map(bot => (
                    <article className={`trading-bots__card${bot.is_new ? ' is-new' : ''}`} key={bot.id}>
                        <div className='trading-bots__meta'>
                            <span className='trading-bots__category'>{CATEGORY_LABELS[categoryOf(bot)]}</span>
                            {bot.is_new && <span className='trading-bots__badge'>{localize('NEW')}</span>}
                        </div>
                        <h3 className='trading-bots__name'>{bot.name}</h3>
                        {versions[bot.id] > 1 && (
                            <span className='trading-bots__versions'>
                                {localize('Newest of')} {versions[bot.id]} {localize('versions')}
                            </span>
                        )}
                        <p className='trading-bots__description'>{bot.description}</p>
                        <button
                            className='trading-bots__load-button'
                            onClick={() => handleLoad(bot)}
                            disabled={loading_id === bot.id}
                        >
                            {loading_id === bot.id ? localize('Loading...') : localize('Load bot')}
                        </button>
                    </article>
                ))}
                {!filtered.length && <div className='trading-bots__empty'>{localize('No bots match your search.')}</div>}
            </div>

            {filtered.length > limit && (
                <button type='button' className='trading-bots__more' onClick={() => setLimit(l => l + PAGE_SIZE)}>
                    {localize('Show more')} ({filtered.length - limit})
                </button>
            )}
        </div>
    );
};

export default TradingBots;
