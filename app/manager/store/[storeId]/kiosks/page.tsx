import KiosksPage from '@/app/admin/store/[storeId]/kiosks/page';

export default function ManagerKiosksPage({ params }: { params: Promise<{ storeId: string }> }) {
  return <KiosksPage params={params} />;
}
