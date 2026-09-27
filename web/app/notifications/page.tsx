'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, fmtDT } from '../../lib/api';

export default function NotificationsPage() {
  const [data, setData] = useState<any>({ list: [], unread: 0 });

  async function load() { setData(await api('/api/notifications/my')); }
  useEffect(() => {
    load().catch(() => {});
    api('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <Shell title="消息通知">
      <div className="card">
        {data.list.length === 0 ? <div className="empty">暂无消息</div> : data.list.map((n: any) => (
          <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>{n.content}</div>
            <div className="small muted">
              {fmtDT(n.createdAt)}
              {n.orderId && <> ｜ <Link href={`/orders/${n.orderId}`}>查看订单</Link></>}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
