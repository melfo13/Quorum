import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { TopBar } from '@/components/shell/TopBar';
import { getPracticeDataset, getResult, getSource } from '@/lib/server/state';
import './globals.css';

export const metadata: Metadata = {
  title: 'PulseGroup',
  description: 'Consolidación del presupuesto del grupo donde cada cifra se rastrea hasta su celda de origen.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const source = await getSource();
  // With no files loaded there is nothing to compute: the bar shows the group's scope and no counts.
  const r = source.kind === 'none' ? null : await getResult();
  const group = r?.assumptions ?? getPracticeDataset().assumptions;
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <TopBar
          scope={`Presupuesto del grupo ${group.fiscalYear} · ${group.groupCurrency}`}
          openBlocks={r?.openBlocks.length ?? 0}
          practice={source.kind === 'practice'}
          uploaded={source.kind === 'upload'}
        />
        <main className="mx-auto box-border flex w-full max-w-[1208px] flex-col gap-6 px-4 py-6 sm:px-9 sm:py-9">{children}</main>
      </body>
    </html>
  );
}
