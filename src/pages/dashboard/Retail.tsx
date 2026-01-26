import { ShoppingCart, Receipt, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequireModule } from '@/components/auth/RequireModule';
import { POSPanel } from '@/components/retail/POSPanel';
import { SalesHistory } from '@/components/retail/SalesHistory';
import { InventoryView } from '@/components/retail/InventoryView';

const Retail = () => {
  return (
    <RequireModule module="retail">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Retail / Punto de Venta
          </h1>
          <p className="text-muted-foreground mt-1">
            Registra ventas rápidas y gestiona tu inventario
          </p>
        </div>

        <Tabs defaultValue="pos" className="w-full">
          <TabsList>
            <TabsTrigger value="pos" className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Nueva Venta
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Historial
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inventario
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pos" className="mt-6">
            <POSPanel />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <SalesHistory />
          </TabsContent>

          <TabsContent value="inventory" className="mt-6">
            <InventoryView />
          </TabsContent>
        </Tabs>
      </div>
    </RequireModule>
  );
};

export default Retail;
