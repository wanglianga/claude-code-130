'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '../../../components/Shell';
import { api } from '../../../lib/api';

export default function NewOrderPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState<any>({
    storeId: '', hospitalId: '', existingPetId: '',
    name: '', species: 'CAT', breed: '', weightKg: '', deathTime: '',
    needPickup: true, pickupAddress: '',
    needCeremony: true, ceremonyTime: '',
    individualCremation: true,
    urnType: 'STANDARD', needPawPrint: true, needPhotoVideo: true,
    storageMonths: 0, handoverMethod: 'SELF',
    remark: '',
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    api('/api/stores').then(setStores);
    api('/api/hospitals').then(setHospitals);
    api('/api/pets/my').then(setPets).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const body: any = {
        storeId: Number(f.storeId),
        hospitalId: f.hospitalId ? Number(f.hospitalId) : null,
        needPickup: f.needPickup, pickupAddress: f.pickupAddress,
        needCeremony: f.needCeremony, ceremonyTime: f.needCeremony && f.ceremonyTime ? new Date(f.ceremonyTime).toISOString() : null,
        individualCremation: f.individualCremation,
        urnType: f.urnType, needPawPrint: f.needPawPrint, needPhotoVideo: f.needPhotoVideo,
        storageMonths: Number(f.storageMonths || 0), handoverMethod: f.handoverMethod,
        remark: f.remark,
      };
      if (f.existingPetId) {
        body.petId = Number(f.existingPetId);
      } else {
        if (!f.name) { setErr('请填写宠物姓名'); setLoading(false); return; }
        body.pet = {
          name: f.name, species: f.species, breed: f.breed, weightKg: Number(f.weightKg || 0),
          deathTime: f.deathTime ? new Date(f.deathTime).toISOString() : null,
        };
      }
      const d = await api('/api/orders', { method: 'POST', body });
      router.push(`/orders/${d.order.id}`);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  const Check = ({ k, label }: { k: string; label: string }) => (
    <div className="checkbox-row">
      <input id={k} type="checkbox" checked={f[k]} onChange={e => set(k, e.target.checked)} />
      <label htmlFor={k} style={{ marginTop: 0 }}>{label}</label>
    </div>
  );

  return (
    <Shell title="预约宠物善终服务">
      <form className="card" onSubmit={submit}>
        <h2>① 服务门店与转介来源</h2>
        <div className="grid grid-2">
          <div>
            <label>服务门店 *</label>
            <select value={f.storeId} onChange={e => set('storeId', e.target.value)}>
              <option value="">请选择门店</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>宠物医院转介(选填)</label>
            <select value={f.hospitalId} onChange={e => set('hospitalId', e.target.value)}>
              <option value="">非医院转介/自行预约</option>
              {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}({h.contactName})</option>)}
            </select>
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>② 宠物信息</h2>
        {pets.length > 0 && (
          <div>
            <label>使用已登记的宠物</label>
            <select value={f.existingPetId} onChange={e => set('existingPetId', e.target.value)}>
              <option value="">填写新宠物信息</option>
              {pets.map(p => <option key={p.id} value={p.id}>{p.name}({p.breed || '—'})</option>)}
            </select>
          </div>
        )}
        {!f.existingPetId && (
          <div className="grid grid-3">
            <div><label>宠物姓名 *</label><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="如:咪咪" /></div>
            <div>
              <label>种类 *</label>
              <select value={f.species} onChange={e => set('species', e.target.value)}>
                <option value="CAT">猫</option><option value="DOG">犬</option>
                <option value="RABBIT">兔</option><option value="EXOTIC">异宠</option>
              </select>
            </div>
            <div><label>品种</label><input value={f.breed} onChange={e => set('breed', e.target.value)} placeholder="如:英国短毛猫" /></div>
            <div><label>体重(kg)</label><input type="number" step="0.1" min="0" value={f.weightKg} onChange={e => set('weightKg', e.target.value)} placeholder="如:4.2" /></div>
            <div><label>死亡时间</label><input type="datetime-local" value={f.deathTime} onChange={e => set('deathTime', e.target.value)} /></div>
          </div>
        )}

        <h2 style={{ marginTop: 20 }}>③ 服务选项</h2>
        <div className="grid grid-2">
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <Check k="needPickup" label="需要上门接送" />
            {f.needPickup && <input style={{ marginTop: 8 }} placeholder="接送地址" value={f.pickupAddress} onChange={e => set('pickupAddress', e.target.value)} />}
          </div>
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <Check k="needCeremony" label="需要告别纪念仪式" />
            {f.needCeremony && <input style={{ marginTop: 8 }} type="datetime-local" value={f.ceremonyTime} onChange={e => set('ceremonyTime', e.target.value)} />}
          </div>
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <Check k="individualCremation" label="单独火化(单独捡灰)" />
          </div>
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <label style={{ marginTop: 0 }}>骨灰盒</label>
            <select value={f.urnType} onChange={e => set('urnType', e.target.value)}>
              <option value="NONE">不需要</option><option value="STANDARD">标准骨灰盒</option>
              <option value="PREMIUM">精品骨灰盒</option><option value="CUSTOM">定制骨灰盒</option>
            </select>
          </div>
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <Check k="needPawPrint" label="爪印 / 毛发纪念" />
          </div>
          <div className="card" style={{ background: '#faf7f1', margin: 0 }}>
            <Check k="needPhotoVideo" label="照片 / 视频纪念" />
          </div>
        </div>
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <label>骨灰寄存期限</label>
            <select value={f.storageMonths} onChange={e => set('storageMonths', e.target.value)}>
              <option value={0}>不寄存(自行领取/寄送)</option>
              <option value={1}>1 个月</option><option value={3}>3 个月</option>
              <option value={6}>6 个月</option><option value={12}>1 年</option>
              <option value={36}>3 年</option>
            </select>
          </div>
          <div>
            <label>骨灰交付方式(不寄存时)</label>
            <select value={f.handoverMethod} onChange={e => set('handoverMethod', e.target.value)} disabled={Number(f.storageMonths) > 0}>
              <option value="SELF">到店自行领取</option><option value="SHIPMENT">快递寄送</option>
            </select>
          </div>
        </div>

        <label>备注(心愿/禁忌/特殊需求)</label>
        <textarea value={f.remark} onChange={e => set('remark', e.target.value)} placeholder="请告诉我们您的需求,我们会尽力安排" />

        {err && <div className="error">{err}</div>}
        <div className="row" style={{ marginTop: 16 }}>
          <button disabled={loading || !f.storeId}>{loading ? '提交中…' : '提交预约申请'}</button>
          <span className="muted small">提交后客服将尽快与您确认服务方案与报价</span>
        </div>
      </form>
    </Shell>
  );
}
