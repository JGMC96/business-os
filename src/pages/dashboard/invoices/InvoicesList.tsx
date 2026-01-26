import { useNavigate } from 'react-router-dom';
import { useInvoices } from '@/hooks/useInvoices';
import { InvoicesHeader } from '@/components/invoices/InvoicesHeader';
import { InvoicesTable } from '@/components/invoices/InvoicesTable';

export default function InvoicesList() {
  const navigate = useNavigate();
  const {
    invoices,
    isLoading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    updateInvoiceStatus,
  } = useInvoices();

  return (
    <div className="space-y-6">
      <InvoicesHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onNewInvoice={() => navigate('/dashboard/invoices/new')}
      />
      <InvoicesTable
        invoices={invoices}
        isLoading={isLoading}
        onStatusChange={updateInvoiceStatus}
      />
    </div>
  );
}
