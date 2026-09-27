'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';
import {
  api, getUser, ORDER_STATUS, NODE_STATUS, FEE_STATUS, FEE_CATEGORY,
  INCIDENT_TYPE_NAMES, INCIDENT_STATUS, KEEPSAKE_STATUS, KEEPSAKE_TYPES,
  FOLLOWUP_TYPES, SPECIES, URN_TYPES, HANDOVER, EVIDENCE_KINDS,
  fmtDT, fmtD, money,
} from '../../../lib/api';

const NODE_DOT: Record<string, string> = { DONE: 'done', IN_PROGRESS: 'active', BLOCKED: 'blocked' };

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const user = getUser();
  const [d, setD] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api(`/api/orders/${id}`);
    setD(data);
  }
  useEffect(() => {
    load().catch(e => setErr(e.message));
    if ([ 'CS', 'MANAGER'].includes(user.role)) {
      api('/api/staff').then(setStaff).catch(() => {});
      api('/api/cabinets').then(setCabinets).catch(() => {});
    }
  }, [id]);

  async function act(fn: () => Promise<any>, okMsg?: string) {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); await load(); if (okMsg) setMsg(okMsg); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!d) return <Shell><div className="empty">{err || '加载中…'}</div></Shell>;
  const o = d.order;
  const isCS = ['CS', 'MANAGER'].includes(user.role);
  const freeCabinets = cabinets.filter((c: any) => c.status === 'FREE' || c.id === d.storage?.cabinetId);

  return (
    <Shell title={`订单 ${o.code}`}>
      {err && <div className="card" style={{ borderColor: '#e8cfcc' }}><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      {msg && <div className="card" style={{ borderColor: '#cfe0d1' }}><div className="ok" style={{ margin: 0 }}>{msg}</div></div>}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title"><h2 style={{ margin: 0 }}>宠物与服务信息</h2><span className="badge amber">{ORDER_STATUS[o.status]}</span></div>
          <dl className="kv">
            <dt>宠物</dt><dd>{d.pet.name} · {SPECIES[d.pet.species]} · {d.pet.breed || '品种未填'} · {Number(d.pet.weightKg)}kg</dd>
            <dt>死亡时间</dt><dd>{fmtDT(d.pet.deathTime)}</dd>
            <dt>主人</dt><dd>{d.owner.name} {d.owner.phone}</dd>
            <dt>服务门店</dt><dd>{d.store.name}</dd>
            <dt>医院转介</dt><dd>{d.hospital ? `${d.hospital.name}(${d.hospital.contactName})` : '自行预约'}</dd>
            <dt>服务选项</dt><dd>
              {[o.needPickup && '上门接送', o.needCeremony && '告别仪式', o.individualCremation && '单独火化',
                o.needPawPrint && '爪印毛发纪念', o.needPhotoVideo && '照片视频'].filter(Boolean).join('、') || '基础火化'}
            </dd>
            <dt>骨灰盒</dt><dd>{URN_TYPES[o.urnType]}</dd>
            <dt>寄存期限</dt><dd>{o.storageMonths > 0 ? `${o.storageMonths} 个月(${HANDOVER[o.handoverMethod]})` : `不寄存(${HANDOVER[o.handoverMethod]})`}</dd>
            <dt>仪式时间</dt><dd>{fmtDT(o.ceremonyTime)}</dd>
            <dt>报价</dt><dd>{o.quotedAmount != null ? <><b>{money(o.quotedAmount)}</b>(按 {o.quotedWeightKg}kg)</> : '待客服报价'}</dd>
            {o.remark && <><dt>家属备注</dt><dd>{o.remark}</dd></>}
          </dl>
        </div>

        <div className="card">
          <div className="card-title"><h2 style={{ margin: 0 }}>服务环节时间线</h2><span className="muted small">承诺时间 · 见证材料 · 家属确认</span></div>
          <div className="timeline">
            {d.nodes.map((n: any) => (
              <div key={n.id} className="tl-item">
                <span className={`tl-dot ${NODE_DOT[n.status] || ''}`} />
                <div className="spread">
                  <b>{n.seq + 1}. {n.typeName}</b>
                  <span className={`badge ${n.status === 'DONE' ? 'green' : n.status === 'IN_PROGRESS' ? 'blue' : n.status === 'BLOCKED' ? 'red' : 'gray'}`}>
                    {NODE_STATUS[n.status]}
                  </span>
                </div>
                <div className="small muted">
                  负责人:{n.assigneeName || '待调度'} ｜ 承诺:{fmtDT(n.promisedAt)} ｜ 完成:{fmtDT(n.completedAt)}
                </div>
                {n.status === 'DONE' && (
                  <div className="small" style={{ marginTop: 2 }}>
                    家属确认: {n.ownerConfirmed ? <span className="badge green">已确认 {fmtDT(n.ownerConfirmedAt)}</span> : <span className="badge amber">待确认</span>}
                  </div>
                )}
                {n.evidence?.length > 0 && n.evidence.map((e: any, i: number) => (
                  <div key={i} className="evidence">
                    <b>[{EVIDENCE_KINDS[e.kind] || e.kind}]</b> {e.note}
                    {e.url && <> ｜ <a href={e.url} target="_blank" rel="noreferrer">查看材料</a></>}
                    <div className="muted">上传:{e.uploadedBy} · {fmtDT(e.uploadedAt)}</div>
                  </div>
                ))}
                <NodeActions n={n} d={d} user={user} staff={staff} freeCabinets={freeCabinets} act={act} load={load} orderId={Number(id)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 客服确认方案 */}
      {o.status === 'PENDING' && isCS && <ConfirmPanel orderId={o.id} act={act} />}

      {/* 客服调度 */}
      {isCS && [ 'CONFIRMED', 'SCHEDULED'].includes(o.status) && <DispatchPanel d={d} staff={staff} act={act} />}

      {/* 异常工单 */}
      <IncidentsPanel d={d} user={user} act={act} />

      <div className="grid grid-2">
        {/* 费用明细 */}
        <div className="card">
          <div className="card-title">
            <h2 style={{ margin: 0 }}>费用明细</h2>
            <b>合计(应收): {money(d.fees.reduce((s: number, f: any) => s + (Number(f.amount) > 0 ? Number(f.amount) : 0), 0))}</b>
          </div>
          <table>
            <thead><tr><th>项目</th><th>类别</th><th>金额</th><th>状态</th></tr></thead>
            <tbody>
              {d.fees.map((f: any) => (
                <tr key={f.id}>
                  <td className="small">{f.name}<div className="muted">录入:{f.createdByName}</div></td>
                  <td><span className="badge gray">{FEE_CATEGORY[f.category]}</span></td>
                  <td style={{ color: Number(f.amount) < 0 ? 'var(--green)' : undefined }}>{money(f.amount)}</td>
                  <td>
                    <span className={`badge ${f.status === 'PAID' || f.status === 'SETTLED' ? 'green' : 'amber'}`}>{FEE_STATUS[f.status]}</span>
                    {user.role === 'OWNER' && f.status === 'CONFIRMED' && (
                      <button className="sm success" style={{ marginLeft: 6 }} disabled={busy}
                        onClick={() => act(async () => api(`/api/fees/${f.id}/pay`, { method: 'POST' }), '支付成功(模拟)')}>立即支付</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.fees.length === 0 && <div className="empty small">客服确认方案后生成费用明细</div>}
        </div>

        {/* 纪念品 / 寄存 / 寄送 */}
        <div>
          <div className="card">
            <h2>纪念品制作</h2>
            {d.keepsakes.length === 0 ? <div className="empty small">无纪念品工单</div> : (
              <table>
                <tbody>
                  {d.keepsakes.map((k: any) => (
                    <tr key={k.id}>
                      <td>{KEEPSAKE_TYPES[k.type]}</td>
                      <td><span className={`badge ${k.status === 'DONE' ? 'green' : k.status === 'FAILED' ? 'red' : 'amber'}`}>{KEEPSAKE_STATUS[k.status]}</span>
                        {k.failReason && <div className="muted small">{k.failReason}(第 {k.attemptCount + 1} 次)</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="muted small">纪念品制作状态会影响客服回访节奏;失败将自动生成异常工单。</div>
          </div>

          <div className="card">
            <h2>骨灰去向</h2>
            {d.storage ? (
              <dl className="kv">
                <dt>寄存位置</dt><dd>{d.storage.positionDesc}</dd>
                <dt>寄存期限</dt><dd>{fmtD(d.storage.startDate)} ~ {fmtD(d.storage.endDate)} <span className={`badge ${d.storage.status === 'ACTIVE' ? 'green' : d.storage.status === 'EXPIRED' ? 'red' : 'gray'}`}>{{ ACTIVE: '寄存中', EXPIRED: '已到期未续费', WITHDRAWN: '已取回' }[d.storage.status]}</span></dd>
                <dt>年费</dt><dd>{money(d.storage.yearlyFee)}/年 ｜ 续费 {d.storage.renewCount} 次</dd>
              </dl>
            ) : o.handoverMethod === 'STORAGE' && isCS && o.status !== 'PENDING' ? (
              <StorageAssign d={d} cabinets={freeCabinets} act={act} />
            ) : <div className="small muted">交付方式:{HANDOVER[o.handoverMethod]}</div>}
            {d.shipment ? (
              <div style={{ marginTop: 8 }} className="small">
                寄送:{d.shipment.carrier} 单号 <b>{d.shipment.trackingNo}</b>({{ PREPARING: '准备中', SHIPPED: '已发出', DELIVERED: '已签收', DAMAGED: '破损' }[d.shipment.status]})
                {d.shipment.deliveredAt && ` · 签收于 ${fmtDT(d.shipment.deliveredAt)}`}
              </div>
            ) : o.handoverMethod === 'SHIPMENT' && isCS ? <ShipmentCreate orderId={o.id} act={act} /> : null}
          </div>
        </div>
      </div>

      {/* 回访记录 */}
      <div className="card">
        <h2>情感回访记录</h2>
        {d.followUps.length === 0 ? <div className="empty small">服务完成后将自动安排情绪安抚回访</div> : (
          <table>
            <thead><tr><th>类型</th><th>计划时间</th><th>状态</th><th>记录</th><th>情绪</th><th>下次</th></tr></thead>
            <tbody>
              {d.followUps.map((f: any) => (
                <tr key={f.id}>
                  <td>{f.typeName || FOLLOWUP_TYPES[f.type]}</td>
                  <td className="small">{fmtDT(f.scheduledAt)}</td>
                  <td><span className={`badge ${f.status === 'DONE' ? 'green' : 'amber'}`}>{f.status === 'DONE' ? '已完成' : '待回访'}</span></td>
                  <td className="small">{f.summary || '—'}</td>
                  <td className="small">{f.ownerMood || '—'}</td>
                  <td className="small">{fmtDT(f.nextFollowUpAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="row">
        <Link href="/orders" className="muted-link small">← 返回订单列表</Link>
      </div>
    </Shell>
  );
}

/* ---------------- 子组件 ---------------- */

function NodeActions({ n, d, user, staff, freeCabinets, act, load, orderId }: any) {
  const [show, setShow] = useState(false);
  const [kind, setKind] = useState('NOTE');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const mine = ['CS', 'MANAGER'].includes(user.role) || n.assigneeId === user.id;
  const evidenceKinds = n.type === 'PICKUP' ? ['PHOTO', 'NOTE']
    : n.type === 'CREMATION' ? ['CERT', 'VIDEO', 'PHOTO']
    : n.type === 'KEEPSAKE' ? ['PHOTO', 'NOTE']
    : ['PHOTO', 'NOTE'];

  return (
    <div style={{ marginTop: 6 }}>
      <div className="row">
        {mine && ['ASSIGNED', 'PENDING'].includes(n.status) && (
          <button className="sm" disabled={!n.assigneeId && n.type !== 'CONFIRM'} onClick={() => act(async () => api(`/api/nodes/${n.id}/start`, { method: 'POST' }))}>开始环节</button>
        )}
        {mine && !['DONE', 'SKIPPED'].includes(n.status) && (
          <button className="sm success" onClick={() => setShow(s => !s)}>完成并提交见证材料</button>
        )}
        {user.role === 'OWNER' && n.status === 'DONE' && !n.ownerConfirmed && (
          <button className="sm ghost" onClick={() => act(async () => api(`/api/nodes/${n.id}/owner-confirm`, { method: 'POST' }), '已确认该环节')}>家属确认无误</button>
        )}
      </div>
      {show && (
        <div className="evidence">
          <div className="grid grid-3">
            <select value={kind} onChange={e => setKind(e.target.value)}>
              {evidenceKinds.map(k => <option key={k} value={k}>{EVIDENCE_KINDS[k]}</option>)}
            </select>
            <input placeholder="材料链接(图片/视频 URL,选填)" value={url} onChange={e => setUrl(e.target.value)} />
            <input placeholder="说明(如交接地点/炉号)" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="muted small" style={{ margin: '4px 0' }}>
            {n.type === 'PICKUP' && '※ 接送完成必须上传交接照片'}
            {n.type === 'CREMATION' && '※ 火化完成必须上传火化证明;家属要求视频见证时请一并上传 VIDEO'}
          </div>
          <button className="sm" onClick={() => act(async () => api(`/api/nodes/${n.id}/complete`, {
            method: 'POST', body: { evidence: [{ kind, url, note }], note },
          }), '环节已完成').then(() => { setShow(false); setNote(''); setUrl(''); })}>确认完成</button>
        </div>
      )}
    </div>
  );
}

function ConfirmPanel({ orderId, act }: any) {
  const [amount, setAmount] = useState('');
  const [weight, setWeight] = useState('');
  return (
    <div className="card" style={{ borderColor: '#ecd9b9' }}>
      <h2>客服:确认服务方案与报价</h2>
      <div className="row">
        <div style={{ flex: 1 }}><label style={{ marginTop: 0 }}>报价体重(kg)</label><input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={{ marginTop: 0 }}>报价总额(元)</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <button onClick={() => act(async () => api(`/api/orders/${orderId}/confirm`, {
          method: 'POST', body: { quotedAmount: Number(amount), quotedWeightKg: Number(weight) },
        }), '方案已确认,已生成环节计划与费用明细')}>确认方案</button>
      </div>
    </div>
  );
}

function DispatchPanel({ d, staff, act }: any) {
  const dispatchable = d.nodes.filter((n: any) => ['PENDING', 'ASSIGNED'].includes(n.status));
  const [sel, setSel] = useState<Record<number, any>>({});
  const set = (nodeId: number, k: string, v: any) => setSel((p: any) => ({ ...p, [nodeId]: { ...p[nodeId], [k]: v } }));
  const roleFor = (t: string) => ({
    PICKUP: 'PICKUP', COLD_STORAGE: 'PICKUP', CEREMONY: 'CEREMONY',
    CREMATION: 'CREMATOR', KEEPSAKE: 'KEEPSAKE', URN_HANDOVER: 'CS', STORAGE: 'CS',
  } as any)[t];
  return (
    <div className="card">
      <h2>客服:调度安排(接送 / 冷藏 / 火化炉 / 告别室 / 纪念品)</h2>
      <table>
        <thead><tr><th>环节</th><th>指派人员</th><th>承诺完成时间</th></tr></thead>
        <tbody>
          {dispatchable.map((n: any) => (
            <tr key={n.id}>
              <td>{n.typeName}</td>
              <td>
                <select value={sel[n.id]?.assigneeId || n.assigneeId || ''} onChange={e => set(n.id, 'assigneeId', Number(e.target.value))}>
                  <option value="">{n.assigneeName ? `保持:${n.assigneeName}` : '请选择'}</option>
                  {staff.filter((s: any) => s.role === roleFor(n.type)).map((s: any) =>
                    <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </td>
              <td><input type="datetime-local" value={sel[n.id]?.promisedAt || (n.promisedAt ? new Date(n.promisedAt).toISOString().slice(0, 16) : '')}
                onChange={e => set(n.id, 'promisedAt', e.target.value ? new Date(e.target.value).toISOString() : '')} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ marginTop: 10 }} disabled={!Object.keys(sel).length}
        onClick={() => act(async () => api(`/api/orders/${d.order.id}/dispatch`, {
          method: 'POST', body: { nodes: Object.entries(sel).map(([nodeId, v]: any) => ({ nodeId: Number(nodeId), ...v })) },
        }), '调度已保存,相关人员已收到通知')}>保存调度安排</button>
    </div>
  );
}

function IncidentsPanel({ d, user, act }: any) {
  const [show, setShow] = useState(false);
  const [type, setType] = useState('VIDEO_WITNESS');
  const [desc, setDesc] = useState('');
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolution, setResolution] = useState('');
  const [metaText, setMetaText] = useState('{}');
  const [action, setAction] = useState('REMAKE');

  async function createIncident() {
    await act(async () => api(`/api/orders/${d.order.id}/incidents`, {
      method: 'POST', body: { type, description: desc, meta: JSON.parse(metaText || '{}') },
    }), '异常工单已提交,客服与相关角色将协同处理');
    setShow(false); setDesc(''); setMetaText('{}');
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2 style={{ margin: 0 }}>异常与争议工单(全角色围绕同一只宠物协同)</h2>
        <button className="ghost sm" onClick={() => setShow(s => !s)}>+ 登记异常</button>
      </div>
      {show && (
        <div className="evidence">
          <div className="grid grid-2">
            <select value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(INCIDENT_TYPE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input placeholder="补充说明" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <label>附加数据 JSON(交通延误填 {'{'}"newPromisedAt":"ISO时间"{'}'};体重不符填 {'{'}"adjustAmount":300,"actualWeightKg":7.2{'}'};破损填 {'{'}"compensation":200{'}'})</label>
          <textarea value={metaText} onChange={e => setMetaText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <button className="sm" onClick={createIncident}>提交工单</button>
        </div>
      )}
      {d.incidents.length === 0 ? <div className="empty small">暂无异常工单</div> : (
        <table>
          <thead><tr><th>类型</th><th>标题/描述</th><th>状态</th><th>登记人</th><th>处理</th></tr></thead>
          <tbody>
            {d.incidents.map((inc: any) => (
              <tr key={inc.id}>
                <td><span className="badge blue">{inc.typeName}</span></td>
                <td className="small"><b>{inc.title}</b><div>{inc.description}</div>
                  {inc.resolution && <div className="ok" style={{ margin: '2px 0' }}>处理结果:{inc.resolution}</div>}</td>
                <td><span className={`badge ${inc.status === 'RESOLVED' || inc.status === 'CLOSED' ? 'green' : 'red'}`}>{INCIDENT_STATUS[inc.status]}</span></td>
                <td className="small">{inc.createdByName}</td>
                <td>
                  {inc.status !== 'RESOLVED' && inc.status !== 'CLOSED' && ['CS', 'MANAGER', 'FINANCE'].includes(user.role) && (
                    resolveId === inc.id ? (
                      <div className="evidence">
                        {inc.type === 'KEEPSAKE_FAILURE' && (
                          <select value={action} onChange={e => setAction(e.target.value)}>
                            <option value="REMAKE">安排重新制作</option><option value="REFUND">取消并退款(需在 JSON 填 refundAmount)</option>
                          </select>
                        )}
                        <input placeholder="处理说明" value={resolution} onChange={e => setResolution(e.target.value)} />
                        <textarea placeholder="联动数据 JSON,如 {&quot;adjustAmount&quot;:300,&quot;actualWeightKg&quot;:7.2}" value={metaText} onChange={e => setMetaText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        <div className="row">
                          <button className="sm success" onClick={() => act(async () => api(`/api/incidents/${inc.id}/resolve`, {
                            method: 'POST', body: { resolution, action, meta: JSON.parse(metaText || '{}') },
                          }), '工单已处理并联动费用/调度/回访').then(() => setResolveId(null))}>确认处理</button>
                          <button className="sm ghost" onClick={() => setResolveId(null)}>取消</button>
                        </div>
                      </div>
                    ) : <button className="sm" onClick={() => { setResolveId(inc.id); setMetaText('{}'); setResolution(''); }}>处理工单</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StorageAssign({ d, cabinets, act }: any) {
  const [cabinetId, setCabinetId] = useState('');
  const [months, setMonths] = useState(d.order.storageMonths || 12);
  return (
    <div>
      <label style={{ marginTop: 0 }}>分配寄存柜位(自动生成年费账单与到期提醒)</label>
      <div className="row">
        <select value={cabinetId} onChange={e => setCabinetId(e.target.value)} style={{ flex: 1 }}>
          <option value="">选择空闲柜位</option>
          {cabinets.map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.store?.name} · {money(c.annualFee)}/年</option>)}
        </select>
        <select value={months} onChange={e => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12, 36].map(m => <option key={m} value={m}>{m} 个月</option>)}
        </select>
        <button className="sm" disabled={!cabinetId} onClick={() => act(async () => api(`/api/orders/${d.order.id}/storage/assign`, {
          method: 'POST', body: { cabinetId: Number(cabinetId), months },
        }), '柜位已分配,年费账单已生成')}>入柜</button>
      </div>
    </div>
  );
}

function ShipmentCreate({ orderId, act }: any) {
  const [carrier, setCarrier] = useState('顺丰速运');
  const [no, setNo] = useState('');
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ marginTop: 0 }}>创建寄送单</label>
      <div className="row">
        <select value={carrier} onChange={e => setCarrier(e.target.value)} style={{ width: 130 }}>
          <option>顺丰速运</option><option>京东物流</option><option>EMS</option>
        </select>
        <input style={{ flex: 1 }} placeholder="快递单号" value={no} onChange={e => setNo(e.target.value)} />
        <button className="sm" disabled={!no} onClick={() => act(async () => api(`/api/orders/${orderId}/shipment`, {
          method: 'POST', body: { carrier, trackingNo: no },
        }), '寄送单已创建,家属将收到通知')}>发出</button>
      </div>
    </div>
  );
}
