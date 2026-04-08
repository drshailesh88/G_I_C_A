import { TabBar } from '@/components/tab-bar';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="mx-auto max-w-lg">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
