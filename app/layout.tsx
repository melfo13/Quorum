import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Outfit } from 'next/font/google';
import { AgentProvider } from '@/components/agent/AgentContext';
import { AgentFab, AgentSidebar } from '@/components/agent/AgentSidebar';
import { SideNav } from '@/components/shell/SideNav';
import { TopBar } from '@/components/shell/TopBar';
import { agentMode, agentModel } from '@/lib/agent/config';
import { PRESETS } from '@/lib/agent/presets';
import { getPracticeDataset, getResult, getSource } from '@/lib/server/state';
import './globals.css';

// Titles and big figures. Downloaded at build time and served by the app: no request leaves at run time.
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: 'Quórum',
  description: 'Consolidación del presupuesto del grupo donde cada cifra se rastrea hasta su celda de origen.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const source = await getSource();
  // With no files loaded there is nothing to compute: the bar shows the group's scope and no counts.
  const r = source.kind === 'none' ? null : await getResult();
  const group = r?.assumptions ?? getPracticeDataset().assumptions;
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable} ${outfit.variable}`}>
      <body>
        <AgentProvider>
          {/* The page and the agent side by side: opening the agent makes the page narrower, it covers nothing. */}
          <div className="flex min-h-screen">
            <SideNav
              openBlocks={r?.openBlocks.length ?? 0}
              dataset={source.kind === 'upload' ? 'upload' : source.kind === 'practice' ? 'practice' : 'none'}
              scope={`Presupuesto del grupo ${group.fiscalYear} · ${group.groupCurrency}`}
            />
            <div className="min-w-0 flex-1">
              <TopBar
                scope={`Presupuesto del grupo ${group.fiscalYear} · ${group.groupCurrency}`}
                openBlocks={r?.openBlocks.length ?? 0}
                practice={source.kind === 'practice'}
                uploaded={source.kind === 'upload'}
              />
              {/* @container/main: content layouts decide on this width, which shrinks when the agent opens. */}
              <main className="@container/main mx-auto box-border flex w-full max-w-[1208px] flex-col gap-6 px-4 py-6 sm:px-9 sm:py-9">{children}</main>
            </div>
            <AgentSidebar
              mode={agentMode()}
              model={agentModel()}
              hasData={source.kind !== 'none'}
              dataKey={source.kind === 'upload' ? source.id : source.kind}
              presets={PRESETS.map(({ id, label }) => ({ id, label }))}
            />
          </div>
          <AgentFab />
        </AgentProvider>
      </body>
    </html>
  );
}
