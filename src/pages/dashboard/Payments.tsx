import { RequireModule } from '@/components/auth/RequireModule';
import PaymentsList from '@/pages/dashboard/payments/PaymentsList';

export default function Payments() {
  return (
    <RequireModule module="payments">
      <PaymentsList />
    </RequireModule>
  );
}
