import React from 'react';
import '@/styles/pps-theme.scss';
import { AccountCard, AccumulatorCard, EntryCard, FamilyCards, JournalCard, RiskCard, ScannerCard, ScoreboardCard, SessionCard, SignalsCard, StrategiesCard } from './cards';
import { useProProfit } from './useProProfit';
import './signal-center.scss';

const SignalDashboard = () => {
  const p = useProProfit();
  return (
    <div className='pps-sig pps-sc__scroll'>
      <div className='pps-sig__inner'>
        <SessionCard p={p} />
        <StrategiesCard p={p} />
        <AccountCard cfg={p.cfg} setCfg={p.setCfg} balance={p.account.balance} currency={p.account.currency} />
        <EntryCard cfg={p.cfg} setCfg={p.setCfg} />
        <FamilyCards p={p} />
        <ScannerCard rows={p.scan} />
        <AccumulatorCard s={p.accu} cfg={p.accuCfg} setCfg={p.setAccu} balance={p.account.balance} />
        <RiskCard cfg={p.cfg} setCfg={p.setCfg} />
        <SignalsCard signals={p.signals} mode={p.cfg.entryMode} />
        <ScoreboardCard report={p.report} />
        <JournalCard rows={p.trader.journal} />
      </div>
    </div>
  );
};

export default SignalDashboard;
