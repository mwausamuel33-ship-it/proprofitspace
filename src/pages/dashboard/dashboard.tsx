import React, { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize, Localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import { SessionResults } from '../signal-scanner/scanner-widgets';
import Landing from './landing';
import '@/styles/pps-theme.scss';
import './dashboard.scss';
import './dashboard-pps.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const LANDING_KEY = 'pps_landing_seen';

const readLandingSeen = () => {
    try {
        return localStorage.getItem(LANDING_KEY) === '1';
    } catch {
        return false;
    }
};

const RULE_CARDS = [
    { label: 'Over rule', value: '0,1,2 < 10.5%', note: 'Over 1 or Over 2 · entry on 2, 5, 6' },
    { label: 'Under rule', value: '9,8,7 < 10.5%', note: 'Under 8 or Under 7 · entry on 4, 7, 9' },
    { label: 'Markets', value: 'Vol + Jump', note: 'All indices, last 1000 ticks' },
    { label: 'Recovery', value: 'Martingale', note: 'Safer barrier after a loss, capped steps' },
];

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    const is_logged_in = client.is_logged_in;
    const [show_landing, setShowLanding] = useState(() => !readLandingSeen());

    const launchApp = () => {
        try {
            localStorage.setItem(LANDING_KEY, '1');
        } catch {
            /* storage blocked: the landing page just shows again next visit */
        }
        setShowLanding(false);
    };

    return (
        <React.Fragment>
            {show_landing && <Landing onLaunch={launchApp} />}
            <div
                className={classNames('pps-dashboard', {
                    'pps-dashboard--tour-active': active_tour,
                })}
            >
                <div className='pps-dashboard__content'>
                    {is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}

                    <div className='pps-dashboard__hero'>
                        <div className='pps-dashboard__hero-text'>
                            <h1 className='pps-dashboard__title'>ProProfitSpace</h1>
                            <p className='pps-dashboard__subtitle'>
                                <Localize i18n_default_text='Scan every Volatility and Jump index, then load the Destroyer bot in one click' />
                            </p>
                        </div>
                        <div className='pps-dashboard__hero-actions'>
                            <button className='pps-dashboard__hero-btn' onClick={() => handleTabChange(5)}>
                                <Localize i18n_default_text='Open Scanner' />
                            </button>
                            <button
                                className='pps-dashboard__hero-btn pps-dashboard__hero-btn--secondary'
                                onClick={() => handleTabChange(1)}
                            >
                                <Localize i18n_default_text='Bot Builder' />
                            </button>
                        </div>
                    </div>

                    {is_logged_in && (
                        <div className='pps-dashboard__results'>
                            <SessionResults />
                        </div>
                    )}

                    <div className='pps-dashboard__stats'>
                        {RULE_CARDS.map(card => (
                            <div key={card.label} className='pps-dashboard__stat'>
                                <span className='pps-dashboard__stat-label'>{card.label}</span>
                                <span className='pps-dashboard__stat-value'>{card.value}</span>
                                <span className='pps-dashboard__stat-note'>{card.note}</span>
                            </div>
                        ))}
                    </div>

                    <div className='quick-panel'>
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                            })}
                        >
                            {!has_dashboard_strategies && (
                                <Text
                                    className='title'
                                    as='h2'
                                    color='prominent'
                                    size={isDesktop ? 'sm' : 's'}
                                    lineHeight='xxl'
                                    weight='bold'
                                >
                                    {localize('Load or build your bot')}
                                </Text>
                            )}
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                            >
                                {is_google_drive_configured
                                    ? localize(
                                          'Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.'
                                      )
                                    : localize(
                                          'Import a bot from your computer, build it from scratch, or start with a quick strategy.'
                                      )}
                            </Text>
                        </div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
