'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '../lib/api';

const HOME: Record<string, string> = {
  OWNER: '/orders',
  CS: '/orders',
  PICKUP: '/tasks',
  CEREMONY: '/tasks',
  CREMATOR: '/tasks',
  KEEPSAKE: '/keepsakes',
  FINANCE: '/finance',
  MANAGER: '/manager',
};

export default function IndexPage() {
  const router = useRouter();
  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace('/login'); return; }
    router.replace(HOME[u.role] || '/orders');
  }, [router]);
  return <div className="container muted">加载中…</div>;
}
