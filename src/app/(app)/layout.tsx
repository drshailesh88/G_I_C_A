import { AppShell } from '@/components/app-shell';
import { TabBar } from '@/components/tab-bar';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppShell>
        {children}
      </AppShell>
      <TabBar />
    </>
  );
}
