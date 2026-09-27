'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, NODE_STATUS, SPECIES, fmtDT } from '../../lib/api';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState<Record<number, any>>({});

  async function load() { setTasks(await api('/api/nodes/my-tasks')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);

  async function act(fn: () => Promise<any>) {
    setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
  }
  const set = (id: number, k: string, v: any) => setEv((p: any) => ({ ...p, [id]: { ...p[id], [k]: v } }));

  return (
    <Shell title="我的服务任务">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      {tasks.length === 0 && <div className="card empty">暂无待办任务,客服调度后会出现在这里</div>}
      {tasks.map((t: any) => (
        <div className="card" key={t.id}>
          <div className="spread">
            <div>
              <b>{t.typeName}</b> · 订单 <Link href={`/orders/${t.orderId}`}>{t.order?.code}</Link>
              <div className="small muted">
                宠物:{t.pet?.name}({SPECIES[t.pet?.species] || ''} {t.pet?.breed}) · {Number(t.pet?.weightKg)}kg
                {t.order?.needCeremony && t.type === 'CEREMONY' && ` · 仪式时间 ${fmtDT(t.order.ceremonyTime)}`}
              </div>
              {t.note && <div className="small" style={{ color: 'var(--amber)' }}>{t.note}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${t.status === 'IN_PROGRESS' ? 'blue' : 'amber'}`}>{NODE_STATUS[t.status]}</span>
              <div className="small muted">承诺:{fmtDT(t.promisedAt)}</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {t.status === 'ASSIGNED' && (
              <button className="sm" onClick={() => act(() => api(`/api/nodes/${t.id}/start`, { method: 'POST' }))}>开始执行</button>
            )}
            <input style={{ width: 220 }} placeholder="见证材料链接(照片/视频/证明)" value={ev[t.id]?.url || ''} onChange={e => set(t.id, 'url', e.target.value)} />
            <input style={{ width: 200 }} placeholder="材料说明" value={ev[t.id]?.note || ''} onChange={e => set(t.id, 'note', e.target.value)} />
            <button className="sm success" onClick={() => act(() => api(`/api/nodes/${t.id}/complete`, {
              method: 'POST',
              body: {
                evidence: [{ kind: t.type === 'PICKUP' ? 'PHOTO' : t.type === 'CREMATION' ? 'CERT' : 'PHOTO', url: ev[t.id]?.url || '', note: ev[t.id]?.note || '' }],
                note: ev[t.id]?.note || '',
              },
            }))}>完成环节</button>
            {t.type === 'PICKUP' && (
              <button className="sm ghost" onClick={() => {
                const when = prompt('新的预计到达时间(如 2026-09-26 15:00)');
                if (when) act(() => api(`/api/orders/${t.orderId}/incidents`, {
                  method: 'POST',
                  body: { type: 'TRAFFIC_DELAY', description: '接送途中交通延误', meta: { newPromisedAt: new Date(when.replace(' ', 'T')).toISOString() } },
                }));
              }}>报告交通延误</button>
            )}
            {t.type === 'CREMATION' && (
              <button className="sm ghost" onClick={() => {
                const w = prompt('实测体重(kg)');
                const diff = prompt('费用调整金额(正=补收,负=退还,元)');
                if (w && diff) act(() => api(`/api/orders/${t.orderId}/incidents`, {
                  method: 'POST',
                  body: { type: 'WEIGHT_MISMATCH', description: `实测体重 ${w}kg 与报价不符`, meta: { actualWeightKg: Number(w), adjustAmount: Number(diff) } },
                }));
              }}>报告体重不符</button>
            )}
          </div>
        </div>
      ))}
    </Shell>
  );
}
