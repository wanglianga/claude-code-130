'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, getUser, ORDER_STATUS, SPECIES } from '../../lib/api';

export default function OrdersListPage() {
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const list = await api(`/api/orders${status ? '?status=' + status : ''}`);
      setOrders(list);
    } finally { setLoading(false); }
  }
  useEffect(() => { setUser(getUser()); load(); }, [status]);

  const badgeCls = (s: string) => ({
    PENDING: 'amber', CONFIRMED: 'blue', SCHEDULED: 'blue',
    IN_PROGRESS: 'amber', COMPLETED: 'green', CANCELLED: 'gray',
  } as any)[s] || '';

  return (
    <Shell title={user?.role === 'OWNER' ? '我的善终订单' : '订单列表'}>
      <div className="card">
        <div className="spread">
          <div className="row">
            <span className="muted small">状态筛选:</span>
            <select style={{ width: 160 }} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">全部</option>
              {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {user?.role === 'OWNER' && <Link href="/orders/new"><button>+ 预约新的善终服务</button></Link>}
        </div>
        {loading ? <div className="empty">加载中…</div> : orders.length === 0 ? <div className="empty">暂无订单</div> : (
          <table>
            <thead>
              <tr>
                <th>订单号</th><th>宠物</th><th>{user?.role === 'OWNER' ? '服务门店' : '主人'}</th>
                <th>火化/仪式</th><th>状态</th><th>提交时间</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td><Link href={`/orders/${o.id}`}><b>{o.code}</b></Link></td>
                  <td>{o.pet ? `${o.pet.name}(${SPECIES[o.pet.species] || o.pet.species})` : '—'}</td>
                  <td>{user?.role === 'OWNER' ? o.store?.name : o.owner?.name || '—'}</td>
                  <td className="small">
                    {o.individualCremation ? '单独火化' : '集体火化'}
                    {o.needCeremony ? ' · 告别仪式' : ''}
                    {o.storageMonths > 0 ? ` · 寄存${o.storageMonths}月` : ''}
                  </td>
                  <td><span className={`badge ${badgeCls(o.status)}`}>{ORDER_STATUS[o.status]}</span></td>
                  <td className="small muted">{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
                  <td><Link className="small" href={`/orders/${o.id}`}>查看 →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
