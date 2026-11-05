import { ComponentProps, ReactNode, useMemo } from 'react';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import RootStore from '@/stores/root-store';
import {
    LabelPairedBarsFilterCaptionFillIcon,
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedCheckCaptionFillIcon,
    LabelPairedCircleDotCaptionFillIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedSearchCaptionRegularIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyGuide1pxIcon, LegacyLogout1pxIcon, LegacyTheme1pxIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';

export type TSubmenuSection = 'accountSettings' | 'cashier' | 'reports';

//IconTypes
type TMenuConfig = {
    LeftComponent: React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    submenu?: TSubmenuSection;
    target?: ComponentProps<'a'>['target'];
    isActive?: boolean;
}[];

// Every page of the app, in tab order (index = DBOT_TABS value, hash = the #tab in the URL).
const withSize = (Icon: React.ElementType) => {
    const PageIcon = ({ className }: { className?: string }) => (
        <Icon className={className} height='16px' width='16px' fill='var(--text-prominent)' />
    );
    return PageIcon;
};

const PAGES = [
    { index: 0, hash: 'dashboard', label: 'Dashboard', Icon: withSize(LabelPairedObjectsColumnCaptionRegularIcon) },
    { index: 1, hash: 'bot_builder', label: 'Bot Builder', Icon: withSize(LabelPairedCircleDotCaptionFillIcon) },
    { index: 2, hash: 'chart', label: 'Charts', Icon: withSize(LabelPairedChartLineCaptionRegularIcon) },
    { index: 3, hash: 'trading_bots', label: 'Trading Bots', Icon: withSize(LabelPairedCheckCaptionFillIcon) },
    { index: 4, hash: 'analysis_tool', label: 'Analysis Tool', Icon: withSize(LabelPairedBarsFilterCaptionFillIcon) },
    { index: 5, hash: 'signal_scanner', label: 'Signal Scanner', Icon: withSize(LabelPairedSearchCaptionRegularIcon) },
    { index: 6, hash: 'bulk_trader', label: 'Bulk Trader', Icon: withSize(LabelPairedCircleDotCaptionFillIcon) },
    { index: 7, hash: 'entry_scanner', label: 'Entry Scanner', Icon: withSize(LabelPairedCircleDotCaptionFillIcon) },
    { index: 8, hash: 'ai_assistant', label: 'AI Assistant', Icon: withSize(LabelPairedCircleDotCaptionFillIcon) },
    { index: 9, hash: 'tutorial', label: 'Tutorials', Icon: withSize(LegacyGuide1pxIcon) },
    { index: 10, hash: 'signal_center', label: 'Signal Center', Icon: withSize(LabelPairedCircleDotCaptionFillIcon) },
];

const useMobileMenuConfig = (
    client?: RootStore['client'],
    onLogout?: () => void,
    enableThemeToggle: boolean = true,
    onNavigate?: () => void
) => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();
    const store = useStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dashboard = (store as any)?.dashboard;
    const active_tab = dashboard?.active_tab;

    const menuConfig = useMemo((): TMenuConfig[] => {
        const goToPage = (page: (typeof PAGES)[number]) => {
            dashboard?.setActiveTab?.(page.index);
            window.location.hash = `#${page.hash}`;
            onNavigate?.();
        };

        const pages_section: TMenuConfig = PAGES.map(page => ({
            as: 'button',
            label: localize(page.label),
            LeftComponent: page.Icon,
            isActive: active_tab === page.index,
            onClick: () => goToPage(page),
        }));

        return [
            pages_section,
            [
                // Conditionally include theme toggle based on brand config
                enableThemeToggle && {
                    as: 'button',
                    label: localize('Dark theme'),
                    LeftComponent: LegacyTheme1pxIcon,
                    RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
                },
            ].filter(Boolean) as TMenuConfig,
            [
                client?.is_logged_in &&
                    onLogout && {
                        as: 'button',
                        label: localize('Log out'),
                        LeftComponent: LegacyLogout1pxIcon,
                        onClick: onLogout,
                        removeBorderBottom: true,
                    },
            ].filter(Boolean) as TMenuConfig,
        ].filter(section => section.length > 0);
    }, [client, onLogout, onNavigate, dashboard, active_tab, is_dark_mode_on, toggleTheme, localize, enableThemeToggle]);

    // Check if menu has any items to determine if mobile menu should be shown
    const hasMenuItems = menuConfig.some(section => section.length > 0);

    return {
        config: menuConfig,
        hasMenuItems,
    };
};

export default useMobileMenuConfig;
