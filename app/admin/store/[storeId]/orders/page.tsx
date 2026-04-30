import { redirect } from 'next/navigation';

/**
 * Live Orders have moved to the dedicated EazyOrder Orders Android app.
 * This redirect ensures any bookmarked /orders URLs land on Order History.
 */
export default async function OrdersRedirectPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/admin/store/${storeId}/orders/history`);
}
