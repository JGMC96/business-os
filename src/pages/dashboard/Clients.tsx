import { useState } from 'react';
import { RequireModule } from '@/components/auth/RequireModule';
import { ClientsHeader } from '@/components/clients/ClientsHeader';
import { ClientsTable } from '@/components/clients/ClientsTable';
import { ClientFormDialog } from '@/components/clients/ClientFormDialog';
import { useClients } from '@/hooks/useClients';
import type { Client } from '@/types/database';

export default function Clients() {
  const {
    clients,
    isLoading,
    searchTerm,
    setSearchTerm,
    showInactive,
    setShowInactive,
    createClient,
    updateClient,
    toggleClientStatus,
  } = useClients();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewClient = () => {
    setEditingClient(null);
    setDialogOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: Parameters<typeof createClient>[0]) => {
    setIsSubmitting(true);
    try {
      if (editingClient) {
        return await updateClient(editingClient.id, data);
      } else {
        return await createClient(data);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RequireModule module="clients">
      <div className="space-y-6">
        <ClientsHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          onNewClient={handleNewClient}
        />

        <ClientsTable
          clients={clients}
          isLoading={isLoading}
          onEdit={handleEditClient}
          onToggleStatus={toggleClientStatus}
          showInactive={showInactive}
        />

        <ClientFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          client={editingClient}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </RequireModule>
  );
}
