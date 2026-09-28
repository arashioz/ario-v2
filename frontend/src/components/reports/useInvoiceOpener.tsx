import { useState } from 'react';
import { invoicesService, apiErrorMessage } from '../../services/invoices.service';
import type { Invoice } from '../../services/invoices.service';
import { InvoiceDetailModal } from '../invoices/InvoiceDetailModal';
import { useNotification } from '../../context/NotificationContext';

/** Open any invoice by id from a report row; `onChanged` runs after edit/delete/payment. */
export function useInvoiceOpener(onChanged: () => void) {
  const { showNotification } = useNotification();
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const open = async (id: string) => {
    try {
      setInvoice(await invoicesService.getById(id));
    } catch (err) {
      showNotification({ title: 'خطا', message: apiErrorMessage(err, 'فاکتور پیدا نشد'), type: 'error' });
    }
  };

  const modal = (
    <InvoiceDetailModal
      isOpen={!!invoice}
      invoice={invoice}
      onClose={() => setInvoice(null)}
      onChanged={(updated) => {
        setInvoice(updated);
        onChanged();
      }}
    />
  );

  return { open, modal };
}
