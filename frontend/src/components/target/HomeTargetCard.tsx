import React, { useEffect, useMemo, useState } from 'react';
import { accountingService } from '../../services/accounting.service';
import type { SalesProgress } from '../../services/accounting.service';
import { periodPresets, periodQuery } from '../ui/PeriodPicker';
import { useAuth } from '../../context/AuthContext';
import { TargetProgressCard } from './TargetProgressCard';
import { Bone } from '../ui/Skeleton';

export const HomeTargetCard: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const { user } = useAuth();
  const month = useMemo(() => periodPresets().find((p) => p.from && p.to && p.label.startsWith('ماه')) || periodPresets()[4], []);
  const [board, setBoard] = useState<SalesProgress | null>(null);

  useEffect(() => {
    accountingService.salesProgress(periodQuery(month)).then(setBoard).catch(() => setBoard(null));
  }, [month, refreshKey]);

  if (!board) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5">
        <Bone className="h-12 w-full" />
      </div>
    );
  }

  const mine = board.sellers.find((row) => row.userId === user?.id || row.name === user?.fullName);
  const personal = mine && (mine.targetAmount > 0 || mine.targetKg > 0 || (user?.salesTargetAmount || 0) > 0);
  const row = personal && mine ? mine : board.shop;
  return (
    <TargetProgressCard
      title={personal ? 'تارگت فروش من این ماه' : 'تارگت فروش آریو این ماه'}
      amount={row.amount}
      kg={row.kg}
      targetAmount={'targetAmount' in row ? row.targetAmount : board.shop.targetAmount}
      targetKg={'targetKg' in row ? row.targetKg : board.shop.targetKg}
      invoices={row.invoices}
      href="/sales-target"
      tone={personal ? '#10b981' : '#0ea5e9'}
    />
  );
};
