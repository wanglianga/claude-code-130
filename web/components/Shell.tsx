'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, clearAuth, ROLE_NAMES } from '../lib/api';

const NAV: Record<string, Array<{ href: string; label: string }>> = {
  OWNER: [
    { href: '/orders', label: '我的善终订单' },
    { href: '/orders/new', label: '预约新服务' },
    { href: '/pets', label: '宠物与相册' },
  ],
  CS: [
    { href: '/orders', label: '订单调度' },
    { href: '/incidents', label: '异常工单' },
    { href: '/follow-ups', label: '回访管理' },
    { href: '/storage', label: '寄存柜位' },
  ],
  PICKUP: [{ href: '/tasks', label: '我的接送任务' }, { href: '/orders', label: '订单查询' }],
  CEREMONY: [{ href: '/tasks', label: '我的仪式任务' }, { href: '/orders', label: '订单查询' }],
  CREMATOR: [{ href: '/tasks', label: '我的火化任务' }, { href: '/orders', label: '订单查询' }],
  KEEPSAKE: [{ href: '/keepsakes', label: '纪念品工单' }, { href: '/orders', label: '订单查询' }],
  FINANCE: [{ href: '/finance', label: '费用工作台' }, { href: '/orders', label: '订单查询' }],
  MANAGER: [
    { href: '/manager', label: '运营看板' },
    { href: '/orders', label: '全部订单' },
    { href: '/incidents', label: '异常工单' },
    { href: '/finance', label: '费用工作台' },
    { href: '/storage', label: '寄存柜位' },
    { href: '/follow-ups', label: '回访管理' },
  ],
};

export default function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    setUser(getUser());
    setReady(true);
  }, [router]);

  if (!ready) return <div className="container muted">加载中…</div>;
  const links = NAV[user.role] || [];

  return (
    <div>
      <div className="nav">
        <Link href="/" className="brand">🕯 安宁宠物善终平台</Link>
        {links.map(l => (
          <Link key={l.href} href={l.href} style={{ fontWeight: pathname.startsWith(l.href) && l.href !== '/orders' ? 600 : 400, color: pathname.startsWith(l.href) ? '#fff' : undefined }}>
            {l.label}
          </Link>
        ))}
        <div className="right">
          <Link href="/notifications" style={{ color: '#ddd4c7' }}>消息</Link>
          <span className="small" style={{ color: '#bdb3a5' }}>{user.name} · {ROLE_NAMES[user.role]}</span>
          <button className="ghost sm" style={{ color: '#ddd4c7' }} onClick={() => { clearAuth(); router.replace('/login'); }}>退出</button>
        </div>
      </div>
      <div className="container">
        {title && <h1 style={{ marginBottom: 16 }}>{title}</h1>}
        {children}
      </div>
    </div>
  );
}
