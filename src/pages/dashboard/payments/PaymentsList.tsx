import { useState, useEffect, useCallback } from 'react';
import { PaymentsHeader } from '@/components/payments/PaymentsHeader';
import { PaymentsTable } from '@/components/payments/PaymentsTable';
import { PaymentFormDialog } from '@/components/payments/PaymentFormDialog';
import { usePayments } from '@/hooks/usePayments';
import type { InvoiceForPayment, CreatePaymentData } from '@/types/database';

export default function PaymentsList() {
  const {
    payments,
    isLoading,
    searchTerm,
    setSearchTerm,
    createPayment,
    fetchPayableInvoices,
  } = usePayments();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceForPayment[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  // Load invoices when dialog opens
  const loadInvoices = useCallback(async () => {
    setIsLoadingInvoices(true);
    const data = await fetchPayableInvoices();
    setInvoices(data);
    setIsLoadingInvoices(false);
  }, [fetchPayableInvoices]);

  useEffect(() => {
    if (dialogOpen) {
      loadInvoices();
    }
  }, [dialogOpen, loadInvoices]);

  const handleNewPayment = () => {
    setDialogOpen(true);
  };

  const handleSubmit = async (data: CreatePaymentData): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const success = await createPayment(data);
      return success;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PaymentsHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onNewPayment={handleNewPayment}
      />

      <PaymentsTable
        payments={payments}
        isLoading={isLoading}
        onNewPayment={handleNewPayment}
      />

      <PaymentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        invoices={invoices}
        isLoadingInvoices={isLoadingInvoices}
      />
    </div>
  );
}
