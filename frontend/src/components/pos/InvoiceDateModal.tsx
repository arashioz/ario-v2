import React from 'react';
import { JalaliDateSheet } from '../ui/JalaliDatePicker';
import { todayYmd } from '../../lib/jalali';

interface InvoiceDateModalProps {
  isOpen: boolean;
  currentDate: string; // YYYY-MM-DD (Gregorian)
  onClose: () => void;
  onSelectDate: (dateIso: string) => void;
  title?: string;
  max?: string;
}

export const InvoiceDateModal: React.FC<InvoiceDateModalProps> = ({
  isOpen,
  currentDate,
  onClose,
  onSelectDate,
  title = 'تاریخ فاکتور',
  max,
}) => (
  <JalaliDateSheet
    open={isOpen}
    value={currentDate || todayYmd()}
    title={title}
    max={max}
    onClose={onClose}
    onSelect={onSelectDate}
  />
);
