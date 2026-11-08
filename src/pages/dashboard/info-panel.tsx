import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Modal from '@/components/shared_ui/modal';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import { useDevice } from '@deriv-com/ui';
import { SIDEBAR_INTRO } from './constants';

const QUICK_START = [
    { n: '01', title: 'Scan', text: 'Open the Signal Scanner and let it finish a scan.', tab: DBOT_TABS.SIGNAL_SCANNER },
    { n: '02', title: 'Load', text: 'Pick a bot in Trading Bots, or use Load & Trade in the scanner.', tab: DBOT_TABS.TRADING_BOTS },
    { n: '03', title: 'Test', text: 'Run it on your demo account and watch several sessions first.', tab: null as number | null },
];

const InfoPanel = observer(() => {
    const { isDesktop } = useDevice();
    const { dashboard } = useStore();

    const [is_tour_open, setIsTourOpen] = React.useState(false);

    const {
        active_tour,
        is_info_panel_visible,
        setActiveTab,
        setActiveTabTutorial,
        setInfoPanelVisibility,
        setFaqTitle,
    } = dashboard;
    const switchTab = (link: boolean, label: string, faq_id: string) => {
        const tutorial_link = link ? setActiveTab(DBOT_TABS.TUTORIAL) : null;
        const tutorial_label = label === 'Guide' ? setActiveTabTutorial(0) : setActiveTabTutorial(1);
        setFaqTitle(faq_id);
        return {
            tutorial_link,
            tutorial_label,
        };
    };

    const handleClose = () => {
        setInfoPanelVisibility(false);
        setIsTourOpen(false);
        localStorage.setItem('dbot_should_show_info', JSON.stringify(Date.now()));
    };

    React.useEffect(() => {
        if (is_info_panel_visible) {
            setIsTourOpen(true);
        } else {
            setIsTourOpen(false);
        }
    }, [is_info_panel_visible]);

    const renderInfo = () => (
        <div className='db-info-panel'>
            <div data-testid='close-icon' className='db-info-panel__close-action' onClick={handleClose}>
                <LegacyClose1pxIcon height='18px' width='18px' fill='var(--text-prominent)' />
            </div>

            <div className='pps-info'>
                <Text color='prominent' lineHeight='xxl' size={isDesktop ? 'm' : 's'} weight='bold' as='h1'>
                    Welcome to ProProfitSpace
                </Text>
                <p className='pps-info__lead'>
                    Scan every Volatility index, load a bot with its entry and recovery already set, and keep take profit
                    and stop loss on every run.
                </p>
                <ol className='pps-info__steps'>
                    {QUICK_START.map(step => (
                        <li key={step.n}>
                            <button
                                type='button'
                                className='pps-info__step'
                                disabled={step.tab === null}
                                onClick={() => step.tab !== null && setActiveTab(step.tab)}
                            >
                                <span className='pps-info__step-n'>{step.n}</span>
                                <span>
                                    <b>{step.title}</b>
                                    <small>{step.text}</small>
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
            </div>

            {SIDEBAR_INTRO().slice(1).map(sidebar_item => {
                const { label, content, link } = sidebar_item;
                return (
                    <div key={`${label}-${content}`}>
                        <Text color='prominent' lineHeight='xxl' size={isDesktop ? 'm' : 's'} weight='bold' as='h1'>
                            {label}
                        </Text>
                        {content.map(text => (
                            <Text
                                key={`info-panel-tour${text.data}`}
                                className={classNames('db-info-panel__card', {
                                    'db-info-panel__content': link,
                                })}
                                color='prominent'
                                lineHeight='xl'
                                as='p'
                                onClick={() => switchTab(link, label, text.faq_id)}
                                size={isDesktop ? 's' : 'xxs'}
                            >
                                {text.data}
                            </Text>
                        ))}
                    </div>
                );
            })}
        </div>
    );

    return isDesktop ? (
        !active_tour && (
            <div
                className={classNames('tab__dashboard__info-panel', {
                    'tab__dashboard__info-panel--active': is_info_panel_visible,
                })}
            >
                {renderInfo()}
            </div>
        )
    ) : (
        <Modal
            className='statistics__modal statistics__modal--mobile'
            is_open={is_tour_open}
            toggleModal={handleClose}
            width={'440px'}
        >
            <Modal.Body>{renderInfo()}</Modal.Body>
        </Modal>
    );
});

export default InfoPanel;
