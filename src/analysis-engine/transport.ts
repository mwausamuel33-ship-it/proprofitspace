export type ConnectionState = 'open' | 'connecting' | 'closed';

/**
 * The only thing the analysis engine needs from the Deriv connection. The app supplies one small adapter
 * around its existing WebSocket client, so the engine never opens a second connection of its own.
 */
export interface DerivTransport {
    /** One request, one response (ticks_history, proposal). Rejects on network failure. */
    send(request: Record<string, unknown>): Promise<any>;
    /** A streaming subscription (ticks). Resolves with a function that cancels it. */
    subscribe(request: Record<string, unknown>, onMessage: (message: any) => void): Promise<() => void>;
    /** Connection state changes. The callback must fire once straight away with the current state. */
    onConnectionChange(callback: (state: ConnectionState) => void): () => void;
}
