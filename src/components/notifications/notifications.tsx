import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import classNames from 'classnames';

type TNotificationType = 'success' | 'error' | 'warning' | 'info' | 'signal';

type TNotification = {
    id: string;
    type: TNotificationType;
    title: string;
    message?: string;
    timestamp: number;
};

type TNotificationContext = {
    notifications: TNotification[];
    addNotification: (notification: Omit<TNotification, 'id' | 'timestamp'>) => void;
    removeNotification: (id: string) => void;
    clearAll: () => void;
};

const NotificationContext = createContext<TNotificationContext | null>(null);

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within NotificationProvider');
    return context;
};

type TNotificationProviderProps = {
    children: ReactNode;
};

export const NotificationProvider = ({ children }: TNotificationProviderProps) => {
    const [notifications, setNotifications] = useState<TNotification[]>([]);

    const addNotification = useCallback((notification: Omit<TNotification, 'id' | 'timestamp'>) => {
        const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newNotification: TNotification = {
            ...notification,
            id,
            timestamp: Date.now(),
        };
        setNotifications(prev => [newNotification, ...prev].slice(0, 20));

        // Auto-remove after 6 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 6000);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
            {children}
            <NotificationContainer />
        </NotificationContext.Provider>
    );
};

const NotificationContainer = () => {
    const { notifications, removeNotification } = useNotifications();

    if (notifications.length === 0) return null;

    return (
        <div className='pps-notifications'>
            {notifications.map(notif => (
                <div
                    key={notif.id}
                    className={classNames('pps-notification', `pps-notification--${notif.type}`)}
                    onClick={() => removeNotification(notif.id)}
                >
                    <div className='pps-notification__icon'>
                        {notif.type === 'success' && '✓'}
                        {notif.type === 'error' && '✕'}
                        {notif.type === 'warning' && '⚠'}
                        {notif.type === 'info' && 'ℹ'}
                        {notif.type === 'signal' && '📊'}
                    </div>
                    <div className='pps-notification__content'>
                        <strong className='pps-notification__title'>{notif.title}</strong>
                        {notif.message && <p className='pps-notification__message'>{notif.message}</p>}
                    </div>
                    <button className='pps-notification__close'>×</button>
                </div>
            ))}
        </div>
    );
};

// Helper function for easy imports
export const notify = {
    success: (title: string, message?: string) => {
        // This will be handled by the provider context
        console.log(`[NOTIFY] ${title}: ${message || ''}`);
    },
    error: (title: string, message?: string) => {
        console.log(`[NOTIFY ERROR] ${title}: ${message || ''}`);
    },
    warning: (title: string, message?: string) => {
        console.log(`[NOTIFY WARN] ${title}: ${message || ''}`);
    },
    info: (title: string, message?: string) => {
        console.log(`[NOTIFY INFO] ${title}: ${message || ''}`);
    },
    signal: (title: string, message?: string) => {
        console.log(`[NOTIFY SIGNAL] ${title}: ${message || ''}`);
    },
};
