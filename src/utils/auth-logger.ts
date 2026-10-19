/**
 * Structured logging for authentication flow
 * Provides clear visibility into each stage of the OAuth process
 */

type AuthLogLevel = 'info' | 'warn' | 'error' | 'debug';

interface AuthLogEntry {
    timestamp: number;
    level: AuthLogLevel;
    stage: string;
    message: string;
    data?: Record<string, unknown>;
}

class AuthLogger {
    private static instance: AuthLogger | null = null;
    private logs: AuthLogEntry[] = [];
    private readonly MAX_LOGS = 100;

    static getInstance(): AuthLogger {
        if (!AuthLogger.instance) {
            AuthLogger.instance = new AuthLogger();
        }
        return AuthLogger.instance;
    }

    private log(level: AuthLogLevel, stage: string, message: string, data?: Record<string, unknown>) {
        const entry: AuthLogEntry = {
            timestamp: Date.now(),
            level,
            stage,
            message,
            data,
        };

        this.logs.push(entry);
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }

        // Console output with consistent format
        const prefix = `[Auth][${stage}]`;

        switch (level) {
            case 'info':
                console.info(`${prefix} ${message}`, data ?? '');
                break;
            case 'warn':
                console.warn(`${prefix} ${message}`, data ?? '');
                break;
            case 'error':
                console.error(`${prefix} ${message}`, data ?? '');
                break;
            case 'debug':
                console.debug(`${prefix} ${message}`, data ?? '');
                break;
        }
    }

    info(stage: string, message: string, data?: Record<string, unknown>) {
        this.log('info', stage, message, data);
    }

    warn(stage: string, message: string, data?: Record<string, unknown>) {
        this.log('warn', stage, message, data);
    }

    error(stage: string, message: string, data?: Record<string, unknown>) {
        this.log('error', stage, message, data);
    }

    debug(stage: string, message: string, data?: Record<string, unknown>) {
        this.log('debug', stage, message, data);
    }

    getLogs(): AuthLogEntry[] {
        return [...this.logs];
    }

    clear() {
        this.logs = [];
    }
}

export const authLogger = AuthLogger.getInstance();

// Convenience exports for common auth stages
export const logOAuth = {
    started: (clientId: string) => authLogger.info('OAuth', 'OAuth flow started', { clientId }),
    redirecting: (url: string) => authLogger.info('OAuth', 'Redirecting to Deriv', { url }),
    callbackReceived: (hasCode: boolean, hasState: boolean) => authLogger.info('OAuth', 'OAuth callback received', { hasCode, hasState }),
    stateValidated: () => authLogger.info('OAuth', 'State validated successfully'),
    tokenExchanged: (expiresIn: number) => authLogger.info('OAuth', 'Token exchanged successfully', { expiresIn }),
    completed: (loginId: string) => authLogger.info('OAuth', 'Authentication completed', { loginId }),
    failed: (error: unknown) => authLogger.error('OAuth', 'OAuth flow failed', { error }),
    cancelled: () => authLogger.warn('OAuth', 'OAuth flow cancelled by user'),
};

export const logWebSocket = {
    connecting: (url: string) => authLogger.info('WebSocket', 'Connecting to WebSocket', { url }),
    connected: () => authLogger.info('WebSocket', 'WebSocket connected'),
    disconnected: () => authLogger.warn('WebSocket', 'WebSocket disconnected'),
    reconnecting: (attempt: number) => authLogger.warn('WebSocket', 'Attempting reconnection', { attempt }),
    reconnectFailed: (attempts: number) => authLogger.error('WebSocket', 'Max reconnection attempts reached', { attempts }),
    authorized: (loginId: string) => authLogger.info('WebSocket', 'WebSocket authorized', { loginId }),
};

export const logSession = {
    restoring: () => authLogger.info('Session', 'Attempting to restore session'),
    restored: (loginId: string) => authLogger.info('Session', 'Session restored', { loginId }),
    expired: () => authLogger.warn('Session', 'Session expired, clearing auth data'),
    cleared: () => authLogger.info('Session', 'Auth data cleared'),
};
