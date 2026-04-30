import { redirect } from 'next/navigation';

/**
 * Live Orders have moved to the dedicated EazyOrder Orders Android app.
 * Redirect to Order History for any bookmarked links.
 */
export default async function ManagerOrdersRedirectPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/manager/store/${storeId}/history`);
}
