import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { useInvoices } from '@/hooks/useInvoices';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useClients } from '@/hooks/useClients';
import { useProducts } from '@/hooks/useProducts';

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const { generateInvoiceNumber, createInvoice } = useInvoices();
  const { taxRate, isLoading: settingsLoading } = useBusinessSettings();
  const { clients, isLoading: clientsLoading } = useClients();
  const { products, isLoading: productsLoading } = useProducts();

  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate invoice number on mount
  useEffect(() => {
    const init = async () => {
      setIsGenerating(true);
      const number = await generateInvoiceNumber();
      setInvoiceNumber(number);
      setIsGenerating(false);
    };
    init();
  }, [generateInvoiceNumber]);

  const isLoading = isGenerating || settingsLoading || clientsLoading || productsLoading;

  const handleSubmit = async (data: {
    client_id: string;
    due_date?: string;
    notes?: string;
    items: Array<{
      product_id?: string;
      description: string;
      quantity: number;
      unit_price: number;
    }>;
  }) => {
    if (!invoiceNumber) return;

    setIsSubmitting(true);
    const success = await createInvoice({
      ...data,
      invoice_number: invoiceNumber,
      taxRate,
    });
    setIsSubmitting(false);

    if (success) {
      navigate('/dashboard/invoices');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">
          {isGenerating ? 'Generando número de factura...' : 'Cargando datos...'}
        </p>
      </div>
    );
  }

  if (!invoiceNumber) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-destructive mb-4">
          Error al generar el número de factura
        </p>
        <Button onClick={() => navigate('/dashboard/invoices')}>
          Volver al listado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard/invoices')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nueva Factura</h1>
          <p className="text-muted-foreground">
            Crea una nueva factura para tu negocio
          </p>
        </div>
      </div>

      {/* Form */}
      <InvoiceForm
        invoiceNumber={invoiceNumber}
        clients={clients}
        products={products}
        taxRate={taxRate}
        isLoading={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/dashboard/invoices')}
      />
    </div>
  );
}
