import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { assessStake } from '@/utils/stake-guard';
import './scanner-widgets.scss';

/** DEMO / REAL / logged-out label with the balance. */
export const AccountBadge = observer(() => {
    const { client } = useStore();

    if (!client.is_logged_in) {
        return (
            <span className='pps-w-badge pps-w-badge--out'>
                <i /> Not logged in · log in to trade
            </span>
        );
    }

    const is_demo = !!client.is_virtual;
    const balance = Number(client.balance);

    return (
        <span className={`pps-w-badge ${is_demo ? 'pps-w-badge--demo' : 'pps-w-badge--real'}`}>
            <i /> {is_demo ? 'DEMO ACCOUNT' : 'REAL MONEY'} ·{' '}
            {Number.isFinite(balance) ? balance.toFixed(2) : client.balance} {client.currency}
        </span>
    );
});

/** Shows how big the stake is next to the balance and what a full losing chain would cost. */
export const StakeGuard = observer(({ stake, martingale }: { stake: number; martingale: number }) => {
    const { client } = useStore();
    const a = assessStake(stake, martingale, Number(client.balance));

    return (
        <div className={`pps-w-guard pps-w-guard--${a.level}`}>
            <div className='pps-w-guard__line'>
                <span>Worst-case losing chain</span>
                <b>
                    {a.worstCase.toFixed(2)} {client.currency}
                    {a.worstCasePct !== null && <em> ({a.worstCasePct.toFixed(0)}% of balance)</em>}
                </b>
            </div>
            {a.level !== 'ok' && (
                <div className='pps-w-guard__msg'>
                    {a.level === 'danger' ? 'High risk. ' : 'Careful. '}
                    {a.messages.join(' ')}
                </div>
            )}
        </div>
    );
});

/** Win/loss and profit for the current session (the same numbers as the Summary panel). */
export const SessionResults = observer(() => {
    const { client, transactions } = useStore();
    const s: any = (transactions as any)?.statistics ?? {};
    const won = Number(s.won_contracts) || 0;
    const lost = Number(s.lost_contracts) || 0;
    const runs = won + lost;
    const profit = Number(s.total_profit) || 0;
    const rate = runs ? (won / runs) * 100 : null;

    return (
        <div className='pps-w-results'>
            <div className='pps-w-results__tile'>
                <span>Runs</span>
                <b>{runs}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Won</span>
                <b className='pps-w-up'>{won}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Lost</span>
                <b className='pps-w-down'>{lost}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Win rate</span>
                <b>{rate === null ? '—' : `${rate.toFixed(0)}%`}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Net P/L</span>
                <b className={profit > 0 ? 'pps-w-up' : profit < 0 ? 'pps-w-down' : ''}>
                    {profit > 0 ? '+' : ''}
                    {profit.toFixed(2)} {client.currency}
                </b>
            </div>
        </div>
    );
});
