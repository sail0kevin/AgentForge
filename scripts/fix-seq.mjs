import fs from 'fs';
const path = 'src/components/workspace/workspace-app.tsx';
let c = fs.readFileSync(path, 'utf-8');

// 1. Verify old SequenceDashboard source
const oldFn = 'function SequenceDashboard({ t, agents, messages, totalSpent, budgetStatus })';
const idx = c.indexOf(oldFn);
if (idx === -1) {
  console.error('FATAL: SequenceDashboard not found!');
  process.exit(1);
}
console.log('[OK] Found SequenceDashboard at idx=' + idx);

// Find its end
let depth = 0;
let start = -1;
let end = -1;
for (let i = idx; i < c.length; i++) {
  if (c[i] === '{') { if (depth === 0) start = i; depth++; }
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end === -1) { console.error('FATAL: could not find end'); process.exit(1); }
console.log('[OK] Function spans ' + idx + ' to ' + end + ' (' + (end - idx) + ' chars)');

// 2. New function
const newFn = \unction SequenceDashboard({ t }: { t: Copy }) {
  type DashboardData = {
    agentCount: number;
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    byProvider: { provider: string; count: number }[];
  };
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('fetch failed');
        const data: DashboardData = await response.json();
        if (!cancelled) { setDashboardData(data); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5">
      <Panel title={t.sequenceTitle} desc={t.sequenceDesc}>
        <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
          {t.sequenceSteps.map((step, index) => (
            <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm">
              <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#5B5BD6] shadow-sm">{index + 1}</div>
              {step}
            </div>
          ))}
        </div>
      </Panel>
      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">加载中...</div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">加载失败，请刷新重试</div>
      )}
      {dashboardData && !loading && !error && (
        <>
          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            <InfoBlock label={t.manualAgents} value={String(dashboardData.agentCount)} />
            <InfoBlock label={t.visibleMessages} value={String(dashboardData.messageCount)} />
            <InfoBlock label="用户消息" value={String(dashboardData.userMessages)} />
            <InfoBlock label="AI 回复" value={String(dashboardData.assistantMessages)} />
          </div>
          {dashboardData.byProvider && dashboardData.byProvider.length > 0 && (
            <Panel title="模型供应商分布" desc="按供应商统计 Agent 数量">
              <div className="grid grid-cols-2 gap-3">
                {dashboardData.byProvider.map((row) => (
                  <div key={row.provider} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-medium text-slate-700">{row.provider}</span>
                    <span className="rounded-full bg-[#5B5BD6] px-2.5 py-0.5 text-xs font-semibold text-white">{row.count}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}\;

// 3. Replace the function
c = c.slice(0, idx) + newFn + c.slice(end);

// 4. Replace its call site
c = c.replace(
  'dashboard: <SequenceDashboard t={t} agents={localAgents} messages={visibleMessages} totalSpent={totalSpent} budgetStatus={budgetStatus} />,',
  'dashboard: <SequenceDashboard t={t} />,');

fs.writeFileSync(path, c, 'utf-8');
console.log('[OK] SequenceDashboard replaced successfully');
