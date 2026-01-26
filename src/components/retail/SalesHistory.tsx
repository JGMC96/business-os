import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Receipt, CreditCard, Banknote, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRetailSales } from '@/hooks/useRetailSales';

export function SalesHistory() {
  const { sales, isLoading, refreshSales } = useRetailSales();

  const getPaymentIcon = (method: string | null) => {
    switch (method) {
      case 'card':
        return <CreditCard className="w-4 h-4" />;
      case 'cash':
      default:
        return <Banknote className="w-4 h-4" />;
    }
  };

  const getPaymentLabel = (method: string | null) => {
    switch (method) {
      case 'card':
        return 'Tarjeta';
      case 'cash':
        return 'Efectivo';
      case 'transfer':
        return 'Transferencia';
      default:
        return method || 'N/A';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Historial de Ventas
        </CardTitle>
        <Button variant="outline" size="sm" onClick={refreshSales}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay ventas registradas</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead># Venta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{sale.sale_number}</TableCell>
                  <TableCell>
                    {format(new Date(sale.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sale.client_name}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPaymentIcon(sale.payment_method)}
                      <span>{getPaymentLabel(sale.payment_method)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ${sale.total.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
