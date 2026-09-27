'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, ORDER_STATUS, money, fmtDT } from '../../lib/api';

export default function ManagerPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/manager/dashboard').then(setD).catch(e => setErr(e.message)); }, []);

  if (err) return <Shell title="运营看板"><div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div></Shell>;
  if (!d) return <Shell title="运营看板"><div className="empty">加载中…</div></Shell>;

  const Stat = ({ label, value, sub }: any) => (
    <div className="card" style={{ margin: 0 }}>
      <div className="muted small">{label}</div>
      <div className="stat">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );

  return (
    <Shell title="运营看板(承诺时间 · 见证材料 · 费用变化 · 家属确认)">
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="订单总数" value={d.orderCount} sub={Object.entries(d.orderByStatus).map(([k, v]: any) => `${ORDER_STATUS[k]} ${v}`).join(' · ')} />
        <Stat label="环节准时率" value={`${d.nodeStats.onTimeRate}%`} sub={`超时未完成 ${d.nodeStats.overdueOpenCount} 个环节`} />
        <Stat label="待家属确认环节" value={d.nodeStats.pendingOwnerConfirm} sub="敏感争议可追溯到交接节点" />
        <Stat label="未结异常工单" value={d.incidentStats.open} sub={Object.entries(d.incidentStats.byType).map(([k, v]: any) => `${k} ${v}`).join(' · ') || '无'} />
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="累计应收" value={money(d.feeStats.totalBilled)} sub={`已收 ${money(d.feeStats.totalReceived)}`} />
        <Stat label="费用调整/赔付净额" value={money(d.feeStats.adjustmentSum)} sub={`待审核费用 ${d.feeStats.pendingConfirm} 笔`} />
        <Stat label="寄存柜位" value={`${d.storageStats.active} 在用`} sub={`到期未续费 ${d.storageStats.expired} · 已取回 ${d.storageStats.withdrawn}`} />
        <Stat label="回访任务" value={`${d.followUpStats.pending} 待办`} sub={`已完成 ${d.followUpStats.done}`} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>超时未完成环节(承诺时间已过)</h2>
          {d.nodeStats.overdueOpen.length === 0 ? <div className="empty small">暂无超时环节</div> : (
            <table>
              <thead><tr><th>订单</th><th>环节</th><th>承诺时间</th></tr></thead>
              <tbody>
                {d.nodeStats.overdueOpen.map((n: any) => (
                  <tr key={n.id}>
                    <td><Link href={`/orders/${n.orderId}`}>#{n.orderId}</Link></td>
                    <td>{n.typeName}</td>
                    <td className="small" style={{ color: 'var(--red)' }}>{fmtDT(n.promisedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>多门店服务点</h2>
          <table>
            <thead><tr><th>门店</th><th>订单量</th><th>进行中</th></tr></thead>
            <tbody>
              {d.storeStats.map((s: any) => (
                <tr key={s.store.id}>
                  <td>{s.store.name}<div className="muted small">{s.store.address}</div></td>
                  <td>{s.orders}</td>
                  <td>{s.activeOrders}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <Link href="/orders"><button className="ghost sm">查看全部订单</button></Link>
            <Link href="/incidents"><button className="ghost sm">异常工单</button></Link>
            <Link href="/finance"><button className="ghost sm">费用工作台</button></Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
