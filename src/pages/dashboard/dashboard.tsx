import React from 'react';
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
import './dashboard.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    const is_logged_in = client.is_logged_in;

    return (
        <React.Fragment>
            <div
                className={classNames('pps-dashboard', {
                    'pps-dashboard--tour-active': active_tour,
                })}
            >
                <div className='pps-dashboard__content'>
                    {is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}

                    {/* Hero Section */}
                    <div className='pps-dashboard__hero'>
                        <div className='pps-dashboard__hero-text'>
                            <h1 className='pps-dashboard__title'>
                                ProProfitSpace
                            </h1>
                            <p className='pps-dashboard__subtitle'>
                                <Localize i18n_default_text='AI-Powered Trading Workspace' />
                            </p>
                        </div>
                        <div className='pps-dashboard__hero-actions'>
                            <button
                                className='pps-dashboard__hero-btn'
                                onClick={() => handleTabChange(4)}
                            >
                                <Localize i18n_default_text='View Signals' />
                            </button>
                            <button
                                className='pps-dashboard__hero-btn pps-dashboard__hero-btn--secondary'
                                onClick={() => handleTabChange(5)}
                            >
                                <Localize i18n_default_text='Scan Markets' />
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className='pps-dashboard__stats'>
                        <div className='pps-dashboard__stat glass'>
                            <span className='pps-dashboard__stat-label'>
                                <Localize i18n_default_text='Daily Profit' />
                            </span>
                            <span className='pps-dashboard__stat-value'>—</span>
                        </div>
                        <div className='pps-dashboard__stat glass'>
                            <span className='pps-dashboard__stat-label'>
                                <Localize i18n_default_text='Win Rate' />
                            </span>
                            <span className='pps-dashboard__stat-value'>—</span>
                        </div>
                        <div className='pps-dashboard__stat glass'>
                            <span className='pps-dashboard__stat-label'>
                                <Localize i18n_default_text='Best Market' />
                            </span>
                            <span className='pps-dashboard__stat-value'>—</span>
                        </div>
                        <div className='pps-dashboard__stat glass'>
                            <span className='pps-dashboard__stat-label'>
                                <Localize i18n_default_text='Signals Today' />
                            </span>
                            <span className='pps-dashboard__stat-value'>—</span>
                        </div>
                    </div>

                    {/* Quick Actions */}
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
