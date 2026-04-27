import { useState, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useInventory, ProductWithStock } from '@/hooks/useInventory';
import { useRetailSales, CartItem } from '@/hooks/useRetailSales';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { SaleTicketDialog, TicketData } from './SaleTicketDialog';
import { cn } from '@/lib/utils';

export function POSPanel() {
  const { products, isLoading: productsLoading } = useInventory();
  const { createSale, isCreating } = useRetailSales();
  const { settings } = useBusinessSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string>('cash');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const taxRate = settings?.tax_rate ?? 16;

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const addToCart = (product: ProductWithStock) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.price,
          total: product.price,
        },
      ];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product_id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return { ...item, quantity: newQty, total: newQty * item.unit_price };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + tax;

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const snapshot = [...cart];
    const snapSubtotal = subtotal;
    const snapTax = tax;
    const snapTotal = total;
    const snapPayment = selectedPayment;

    const result = await createSale({
      payment_method: snapPayment,
      items: snapshot,
      subtotal: snapSubtotal,
      tax: snapTax,
      total: snapTotal,
    });

    if (result) {
      setTicket({
        saleNumber: result.sale_number,
        items: snapshot,
        subtotal: snapSubtotal,
        tax: snapTax,
        taxRate,
        total: snapTotal,
        paymentMethod: snapPayment,
        createdAt: new Date(),
      });
      setTicketOpen(true);
      clearCart();
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-220px)]">
      {/* Products Panel */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Productos</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-[calc(100%-80px)] px-6">
            {productsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No se encontraron productos
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-primary font-semibold">${product.price.toFixed(2)}</p>
                    {product.track_inventory && (
                      <Badge variant={product.stock_quantity > 0 ? 'secondary' : 'destructive'} className="mt-1 text-xs">
                        Stock: {product.stock_quantity}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Cart Panel */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Carrito
            {cart.length > 0 && (
              <Badge variant="secondary">{cart.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0">
          <ScrollArea className="flex-1 px-6">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Carrito vacío
              </p>
            ) : (
              <div className="space-y-3 pb-4">
                {cart.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <p className="text-muted-foreground text-xs">
                        ${item.unit_price.toFixed(2)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="font-semibold w-20 text-right">${item.total.toFixed(2)}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeFromCart(item.product_id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Totals & Checkout */}
          <div className="p-6 pt-0 space-y-4">
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA ({taxRate}%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="flex gap-2">
              <Button
                variant={selectedPayment === 'cash' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSelectedPayment('cash')}
              >
                <Banknote className="w-4 h-4 mr-2" />
                Efectivo
              </Button>
              <Button
                variant={selectedPayment === 'card' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSelectedPayment('card')}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Tarjeta
              </Button>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || isCreating}
              onClick={handleCheckout}
            >
              {isCreating ? 'Procesando...' : `Cobrar $${total.toFixed(2)}`}
            </Button>

            {cart.length > 0 && (
              <Button
                variant="ghost"
                className="w-full text-destructive"
                onClick={clearCart}
              >
                Vaciar carrito
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    <SaleTicketDialog open={ticketOpen} onOpenChange={setTicketOpen} ticket={ticket} />
    </>
  );
}
