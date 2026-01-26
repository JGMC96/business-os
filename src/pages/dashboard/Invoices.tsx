import { Routes, Route } from 'react-router-dom';
import { RequireModule } from '@/components/auth/RequireModule';
import InvoicesList from '@/pages/dashboard/invoices/InvoicesList';
import NewInvoicePage from '@/pages/dashboard/invoices/NewInvoicePage';

export default function Invoices() {
  return (
    <RequireModule module="invoicing">
      <Routes>
        <Route index element={<InvoicesList />} />
        <Route path="new" element={<NewInvoicePage />} />
      </Routes>
    </RequireModule>
  );
}
