export type DataStatus = 'LIVE' | 'RECONNECTING' | 'STALE' | 'DISCONNECTED';

/** What the connection state and the age of the newest tick say about the data. Pure: pass `nowEpoch` in. */
export const deriveStatus = (input: {
    connected: boolean;
    reconnecting: boolean;
    lastTickEpoch: number | null;
    medianIntervalSeconds: number | null;
    nowEpoch: number;
}): DataStatus => {
    if (input.reconnecting) return 'RECONNECTING';
    if (!input.connected) return 'DISCONNECTED';
    if (input.lastTickEpoch === null) return 'STALE';
    const limit = Math.max(10, 5 * (input.medianIntervalSeconds ?? 2));
    return input.nowEpoch - input.lastTickEpoch > limit ? 'STALE' : 'LIVE';
};
