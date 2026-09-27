'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, KEEPSAKE_STATUS, KEEPSAKE_TYPES } from '../../lib/api';

export default function KeepsakesPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [err, setErr] = useState('');

  async function load() { setJobs(await api('/api/keepsakes')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);

  async function act(fn: () => Promise<any>) {
    setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell title="纪念品制作工单">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      <div className="card">
        {jobs.length === 0 ? <div className="empty">暂无纪念品工单</div> : (
          <table>
            <thead><tr><th>订单</th><th>纪念品</th><th>状态</th><th>失败原因</th><th>操作</th></tr></thead>
            <tbody>
              {jobs.map((j: any) => (
                <tr key={j.id}>
                  <td><Link href={`/orders/${j.orderId}`}>{j.order?.code}</Link></td>
                  <td>{j.typeName}</td>
                  <td><span className={`badge ${j.status === 'DONE' ? 'green' : j.status === 'FAILED' ? 'red' : 'amber'}`}>{KEEPSAKE_STATUS[j.status]}</span></td>
                  <td className="small">{j.failReason || '—'}{j.attemptCount > 0 && `(第${j.attemptCount + 1}次制作)`}</td>
                  <td className="row">
                    {j.status === 'QUEUED' && <button className="sm" onClick={() => act(() => api(`/api/keepsakes/${j.id}/claim`, { method: 'POST' }))}>认领并开始</button>}
                    {['MAKING', 'REMAKING'].includes(j.status) && (
                      <>
                        <button className="sm success" onClick={() => act(() => api(`/api/keepsakes/${j.id}/status`, { method: 'POST', body: { status: 'DONE' } }))}>制作完成</button>
                        <button className="sm danger" onClick={() => {
                          const reason = prompt('失败原因(将自动生成异常工单并通知客服)');
                          if (reason) act(() => api(`/api/keepsakes/${j.id}/status`, { method: 'POST', body: { status: 'FAILED', failReason: reason } }));
                        }}>制作失败</button>
                      </>
                    )}
                    {j.status === 'FAILED' && <span className="small muted">等待客服处理异常工单</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="muted small" style={{ marginTop: 8 }}>纪念品制作失败会自动生成异常工单,并触发客服次日回访家属。</div>
      </div>
    </Shell>
  );
}
