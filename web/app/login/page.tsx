'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuth } from '../../lib/api';

const HINTS: Array<[string, string]> = [
  ['owner1', '主人·陈静'],
  ['cs1', '客服·周晓'],
  ['pickup1', '接送员·郑师傅'],
  ['ceremony1', '礼仪师·林礼仪'],
  ['cremator1', '火化师·赵火化'],
  ['keepsake1', '纪念品·孙手艺'],
  ['finance1', '财务·钱财务'],
  ['manager1', '管理者·王店长'],
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('owner1');
  const [password, setPassword] = useState('123456');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('token')) router.replace('/');
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setAuth(r.token, r.user);
      router.replace('/');
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <div className="card">
        <h1 style={{ textAlign: 'center' }}>🕯 安宁宠物善终平台</h1>
        <p className="muted small" style={{ textAlign: 'center' }}>预约告别 · 单独火化 · 骨灰寄存 · 纪念回访</p>
        <form onSubmit={submit}>
          <label>用户名</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
          <label>密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          {err && <div className="error">{err}</div>}
          <button style={{ width: '100%', marginTop: 16 }} disabled={loading}>{loading ? '登录中…' : '登 录'}</button>
        </form>
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>测试账号(密码均 123456),点击快速填入:</div>
          <div className="row">
            {HINTS.map(([u, label]) => (
              <button key={u} type="button" className="ghost sm" onClick={() => { setUsername(u); setPassword('123456'); }}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
