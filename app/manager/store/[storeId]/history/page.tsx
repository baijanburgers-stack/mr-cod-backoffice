import OrderHistoryDashboard from '@/components/orders/OrderHistoryDashboard';

export default async function ManagerStoreOrderHistoryPage({ 
  params 
}: { 
  params: Promise<{ storeId: string }> 
}) {
  const { storeId } = await params;
  return <OrderHistoryDashboard storeId={storeId} />;
}
