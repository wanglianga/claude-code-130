'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, FEE_STATUS, FEE_CATEGORY, money } from '../../lib/api';

export default function FinancePage() {
  const [list, setList] = useState<any[]>([]);
  const [tab, setTab] = useState('PENDING');
  const [err, setErr] = useState('');

  async function load() { setList(await api(`/api/fees/workbench${tab ? '?status=' + tab : ''}`)); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, [tab]);

  async function confirm(id: number) {
    setErr('');
    try { await api(`/api/fees/${id}/confirm`, { method: 'POST' }); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  const sum = (arr: any[]) => arr.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <Shell title="财务工作台">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      <div className="card">
        <div className="tabs">
          {[['PENDING', '待我审核'], ['CONFIRMED', '待支付'], ['PAID', '已支付'], ['SETTLED', '已结算(退/赔)'], ['', '全部']].map(([k, v]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{v}</button>
          ))}
        </div>
        {list.length === 0 ? <div className="empty">暂无费用项</div> : (
          <>
            <table>
              <thead><tr><th>订单</th><th>项目</th><th>类别</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {list.map((f: any) => (
                  <tr key={f.id}>
                    <td><Link href={`/orders/${f.orderId}`}>{f.order?.code}</Link></td>
                    <td className="small">{f.name}</td>
                    <td><span className="badge gray">{FEE_CATEGORY[f.category]}</span></td>
                    <td style={{ color: Number(f.amount) < 0 ? 'var(--green)' : undefined }}>{money(f.amount)}</td>
                    <td><span className={`badge ${['PAID', 'SETTLED'].includes(f.status) ? 'green' : 'amber'}`}>{FEE_STATUS[f.status]}</span></td>
                    <td>{f.status === 'PENDING' && <button className="sm success" onClick={() => confirm(f.id)}>审核确认</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted small" style={{ marginTop: 8 }}>
              本页合计:{money(sum(list))} ｜ 其中调整/赔付/退款:{money(sum(list.filter(f => ['ADJUSTMENT', 'COMPENSATION', 'REFUND'].includes(f.category))))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
