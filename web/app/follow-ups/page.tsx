'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, FOLLOWUP_TYPES, MOODS, fmtDT } from '../../lib/api';

export default function FollowUpsPage() {
  const [list, setList] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [doing, setDoing] = useState<number | null>(null);
  const [summary, setSummary] = useState('');
  const [mood, setMood] = useState('STABLE');
  const [nextAt, setNextAt] = useState('');

  async function load() { setList(await api('/api/follow-ups')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);

  async function complete(id: number) {
    setErr('');
    try {
      await api(`/api/follow-ups/${id}/complete`, {
        method: 'POST',
        body: { summary, ownerMood: mood, nextFollowUpAt: nextAt ? new Date(nextAt).toISOString() : null },
      });
      setDoing(null); setSummary(''); setNextAt('');
      await load();
    } catch (e: any) { setErr(e.message); }
  }

  const pending = list.filter(f => f.status === 'PENDING');
  const done = list.filter(f => f.status === 'DONE');

  return (
    <Shell title="回访管理(情绪安抚 · 寄存到期 · 纪念品进度)">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      <div className="card">
        <h2>待回访({pending.length})</h2>
        {pending.length === 0 ? <div className="empty small">暂无待回访任务</div> : (
          <table>
            <thead><tr><th>类型</th><th>订单/宠物</th><th>计划时间</th><th>操作</th></tr></thead>
            <tbody>
              {pending.map((f: any) => (
                <tr key={f.id}>
                  <td><span className="badge blue">{f.typeName}</span></td>
                  <td className="small"><Link href={`/orders/${f.orderId}`}>{f.order?.code}</Link> {f.pet && `· ${f.pet.name}`}</td>
                  <td className="small">{fmtDT(f.scheduledAt)}</td>
                  <td>
                    {doing === f.id ? (
                      <div className="evidence">
                        <textarea placeholder="回访记录(家属状态、诉求、安抚情况)" value={summary} onChange={e => setSummary(e.target.value)} />
                        <div className="row">
                          <select style={{ width: 170 }} value={mood} onChange={e => setMood(e.target.value)}>
                            {Object.entries(MOODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <input type="datetime-local" style={{ width: 210 }} value={nextAt} onChange={e => setNextAt(e.target.value)} title="下次回访时间(选填)" />
                          <button className="sm success" onClick={() => complete(f.id)}>完成回访</button>
                          <button className="sm ghost" onClick={() => setDoing(null)}>取消</button>
                        </div>
                      </div>
                    ) : <button className="sm" onClick={() => { setDoing(f.id); setSummary(''); }}>开始回访</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>已完成回访({done.length})</h2>
        {done.length === 0 ? <div className="empty small">暂无记录</div> : (
          <table>
            <thead><tr><th>类型</th><th>订单</th><th>完成时间</th><th>记录</th><th>情绪</th></tr></thead>
            <tbody>
              {done.map((f: any) => (
                <tr key={f.id}>
                  <td><span className="badge gray">{f.typeName}</span></td>
                  <td className="small"><Link href={`/orders/${f.orderId}`}>{f.order?.code}</Link></td>
                  <td className="small">{fmtDT(f.completedAt)}</td>
                  <td className="small">{f.summary}</td>
                  <td className="small">{MOODS[f.ownerMood] || f.ownerMood || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
