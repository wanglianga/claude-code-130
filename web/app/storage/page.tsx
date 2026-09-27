'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, fmtD, money } from '../../lib/api';

const STORAGE_STATUS: Record<string, [string, string]> = {
  ACTIVE: ['寄存中', 'green'], EXPIRED: ['已到期未续费', 'red'], WITHDRAWN: ['已取回', 'gray'],
};

export default function StoragePage() {
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState('');
  const [fee, setFee] = useState('365');

  async function load() {
    const [c, r] = await Promise.all([api('/api/cabinets'), api('/api/storage-records')]);
    setCabinets(c); setRecords(r);
  }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);

  async function act(fn: () => Promise<any>, ok: string) {
    setErr(''); setMsg('');
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell title="寄存柜位管理">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      {msg && <div className="card"><div className="ok" style={{ margin: 0 }}>{msg}</div></div>}

      <div className="card">
        <div className="card-title">
          <h2 style={{ margin: 0 }}>柜位({cabinets.filter(c => c.status === 'FREE').length} 空闲 / {cabinets.length} 总)</h2>
          <div className="row">
            <input style={{ width: 110 }} placeholder="编号 如 B-101" value={code} onChange={e => setCode(e.target.value)} />
            <input style={{ width: 90 }} placeholder="年费" value={fee} onChange={e => setFee(e.target.value)} />
            <button className="sm" disabled={!code} onClick={() => act(async () => {
              await api('/api/cabinets', { method: 'POST', body: { code, annualFee: Number(fee) } });
              setCode('');
            }, '柜位已创建')}>+ 新增柜位</button>
            <button className="sm ghost" onClick={() => act(() => api('/api/storage/check-expiry', { method: 'POST' }), '已检查到期寄存')}>检查到期</button>
          </div>
        </div>
        <div className="row">
          {cabinets.map((c: any) => (
            <span key={c.id} className={`badge ${c.status === 'FREE' ? 'green' : c.status === 'OCCUPIED' ? 'amber' : 'gray'}`} title={c.store?.name}>
              {c.code} · {c.status === 'FREE' ? '空闲' : c.status === 'OCCUPIED' ? '占用' : '维护'}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>寄存记录</h2>
        {records.length === 0 ? <div className="empty">暂无寄存记录</div> : (
          <table>
            <thead><tr><th>订单</th><th>位置</th><th>期限</th><th>年费</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {records.map((r: any) => {
                const [label, cls] = STORAGE_STATUS[r.status] || [r.status, 'gray'];
                return (
                  <tr key={r.id}>
                    <td><Link href={`/orders/${r.orderId}`}>{r.order?.code}</Link></td>
                    <td className="small">{r.positionDesc}</td>
                    <td className="small">{fmtD(r.startDate)} ~ {fmtD(r.endDate)}<div className="muted">续费 {r.renewCount} 次</div></td>
                    <td>{money(r.yearlyFee)}/年</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="row">
                      {r.status !== 'WITHDRAWN' && (
                        <>
                          <button className="sm" onClick={() => act(() => api(`/api/storage-records/${r.id}/renew`, { method: 'POST', body: { months: 12 } }), '已续费 1 年,账单待财务确认')}>续费 1 年</button>
                          <button className="sm ghost" onClick={() => confirm('确认办理取回?柜位将释放') && act(() => api(`/api/storage-records/${r.id}/withdraw`, { method: 'POST' }), '已办理取回')}>取回</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="muted small" style={{ marginTop: 8 }}>寄存到期未续费会自动生成异常工单与回访任务;柜位状态影响后续回访节奏。</div>
      </div>
    </Shell>
  );
}
