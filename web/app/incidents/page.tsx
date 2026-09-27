'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { api, INCIDENT_STATUS, fmtDT } from '../../lib/api';

export default function IncidentsPage() {
  const [list, setList] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolution, setResolution] = useState('');
  const [metaText, setMetaText] = useState('{}');
  const [action, setAction] = useState('REMAKE');

  async function load() { setList(await api(`/api/incidents${status ? '?status=' + status : ''}`)); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, [status]);

  async function act(fn: () => Promise<any>) {
    setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell title="异常工单中心">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="muted small">状态:</span>
          <select style={{ width: 140 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">全部</option>
            {Object.entries(INCIDENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {list.length === 0 ? <div className="empty">暂无工单</div> : (
          <table>
            <thead><tr><th>订单</th><th>类型</th><th>内容</th><th>状态</th><th>登记</th><th>处理</th></tr></thead>
            <tbody>
              {list.map((inc: any) => (
                <tr key={inc.id}>
                  <td><Link href={`/orders/${inc.orderId}`}>{inc.order?.code}</Link></td>
                  <td><span className="badge blue">{inc.typeName}</span></td>
                  <td className="small">
                    <b>{inc.title}</b><div>{inc.description}</div>
                    {inc.meta && <div className="muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{JSON.stringify(inc.meta)}</div>}
                    {inc.resolution && <div className="ok" style={{ margin: '2px 0' }}>结果:{inc.resolution}({inc.handledByName})</div>}
                  </td>
                  <td><span className={`badge ${['RESOLVED', 'CLOSED'].includes(inc.status) ? 'green' : 'red'}`}>{INCIDENT_STATUS[inc.status]}</span></td>
                  <td className="small">{inc.createdByName}<div className="muted">{fmtDT(inc.createdAt)}</div></td>
                  <td>
                    {!['RESOLVED', 'CLOSED'].includes(inc.status) && (
                      resolveId === inc.id ? (
                        <div className="evidence">
                          {inc.type === 'KEEPSAKE_FAILURE' && (
                            <select value={action} onChange={e => setAction(e.target.value)}>
                              <option value="REMAKE">重新制作</option><option value="REFUND">退款(JSON 填 refundAmount)</option>
                            </select>
                          )}
                          <input placeholder="处理说明" value={resolution} onChange={e => setResolution(e.target.value)} />
                          <textarea placeholder='联动 JSON,如 {"adjustAmount":300,"actualWeightKg":7.2} / {"compensation":200} / {"newTime":"..."}' value={metaText} onChange={e => setMetaText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                          <div className="row">
                            <button className="sm success" onClick={() => act(async () => {
                              await api(`/api/incidents/${inc.id}/resolve`, { method: 'POST', body: { resolution, action, meta: JSON.parse(metaText || '{}') } });
                              setResolveId(null);
                            })}>确认处理</button>
                            <button className="sm ghost" onClick={() => setResolveId(null)}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div className="row">
                          {inc.status === 'OPEN' && <button className="sm ghost" onClick={() => act(() => api(`/api/incidents/${inc.id}/claim`, { method: 'POST' }))}>认领</button>}
                          <button className="sm" onClick={() => { setResolveId(inc.id); setMetaText('{}'); setResolution(''); }}>处理</button>
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
