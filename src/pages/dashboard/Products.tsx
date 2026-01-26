import { useState } from 'react';
import { RequireModule } from '@/components/auth/RequireModule';
import { useProducts, type ProductFormData } from '@/hooks/useProducts';
import { ProductsHeader } from '@/components/products/ProductsHeader';
import { ProductsTable } from '@/components/products/ProductsTable';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import type { Product } from '@/types/database';

export default function Products() {
  const {
    products,
    isLoading,
    searchTerm,
    setSearchTerm,
    showInactive,
    setShowInactive,
    createProduct,
    updateProduct,
    toggleProductStatus,
  } = useProducts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewProduct = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: ProductFormData): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        return await updateProduct(editingProduct.id, data);
      } else {
        return await createProduct(data);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    await toggleProductStatus(id, currentStatus);
  };

  return (
    <RequireModule module="products">
      <div className="space-y-6">
        <ProductsHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          onNewProduct={handleNewProduct}
        />

        <ProductsTable
          products={products}
          isLoading={isLoading}
          searchTerm={searchTerm}
          onEdit={handleEdit}
          onToggleStatus={handleToggleStatus}
          onNewProduct={handleNewProduct}
        />

        <ProductFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          product={editingProduct}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </RequireModule>
  );
}
