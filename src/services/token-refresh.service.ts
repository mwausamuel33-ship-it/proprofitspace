import { refreshAccessToken, getAuthInfo, storeAuthInfo, clearAuthInfo } from '@/external/deriv-core';
import { setAuthData, setIsAuthorized, setAccountList } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { clearAuthData as clearLegacyAuthData } from '@/utils/auth-utils';
import { ErrorLogger } from '@/utils/error-logger';

const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000; // Refresh 2 minutes before expiry
const TOKEN_VALIDATION_INTERVAL_MS = 60 * 1000; // Check token validity every minute

class TokenRefreshService {
    private static instance: TokenRefreshService | null = null;
    private validationInterval: ReturnType<typeof setInterval> | null = null;
    private isRefreshing = false;
    private refreshPromise: Promise<void> | null = null;

    static getInstance(): TokenRefreshService {
        if (!TokenRefreshService.instance) {
            TokenRefreshService.instance = new TokenRefreshService();
        }
        return TokenRefreshService.instance;
    }

    startValidation = (): void => {
        this.stopValidation();
        this.validationInterval = setInterval(() => {
            this.validateAndRefreshIfNeeded();
        }, TOKEN_VALIDATION_INTERVAL_MS);
    };

    stopValidation = (): void => {
        if (this.validationInterval) {
            clearInterval(this.validationInterval);
            this.validationInterval = null;
        }
    };

    validateAndRefreshIfNeeded = async (): Promise<void> => {
        const authInfo = getAuthInfo();
        if (!authInfo) return;

        const now = Date.now();
        const expiresAt = authInfo.expires_at * 1000;

        // If token expires within margin, refresh it
        if (now + TOKEN_REFRESH_MARGIN_MS >= expiresAt) {
            await this.refreshToken(authInfo);
        }
    };

    refreshToken = async (authInfo: { access_token: string; refresh_token: string; client_id?: string }): Promise<void> => {
        // Prevent concurrent refresh attempts
        if (this.isRefreshing) {
            return this.refreshPromise ?? Promise.resolve();
        }

        this.isRefreshing = true;
        this.refreshPromise = (async (): Promise<void> => {
            try {
                const clientId = process.env.NEXT_PUBLIC_DERIV_APP_ID;
                if (!clientId) {
                    throw new Error('Missing client ID for token refresh');
                }

                const newAuthInfo = await refreshAccessToken(authInfo.refresh_token, clientId);

                // Store refreshed token
                storeAuthInfo(newAuthInfo);

                // Update accounts with new token
                const accounts = await DerivWSAccountsService.fetchAccountsList(newAuthInfo.access_token);
                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);
                    setAccountList(
                        accounts
                            .filter(a => !a.status || a.status === 'active')
                            .map(a => ({
                                balance: parseFloat(a.balance) || 0,
                                currency: a.currency || 'USD',
                                is_virtual: a.account_type === 'demo' ? 1 : 0,
                                loginid: a.account_id,
                            }))
                    );
                }

                ErrorLogger.info('TokenRefresh', 'Access token refreshed successfully');
            } catch (error) {
                ErrorLogger.error('TokenRefresh', 'Token refresh failed, clearing auth data', error);
                await this.handleRefreshFailure();
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    };

    handleRefreshFailure = async (): Promise<void> => {
        clearAuthInfo();
        clearLegacyAuthData();
        setAuthData(null);
        setIsAuthorized(false);
        setAccountList([]);
        DerivWSAccountsService.clearStoredAccounts();
        DerivWSAccountsService.clearCache();

        localStorage.removeItem('active_loginid');
        localStorage.removeItem('account_type');

        // Redirect to login
        const { generateOAuthURL } = await import('@/components/shared');
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        }
    };

    destroy = (): void => {
        this.stopValidation();
        this.isRefreshing = false;
        this.refreshPromise = null;
    };
}

export const tokenRefreshService = TokenRefreshService.getInstance();
