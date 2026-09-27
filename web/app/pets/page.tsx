'use client';
import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { api, SPECIES, fmtDT } from '../../lib/api';

export default function PetsPage() {
  const [pets, setPets] = useState<any[]>([]);
  const [albums, setAlbums] = useState<Record<number, any[]>>({});
  const [url, setUrl] = useState<Record<number, string>>({});
  const [caption, setCaption] = useState<Record<number, string>>({});
  const [err, setErr] = useState('');

  async function load() {
    const list = await api('/api/pets/my');
    setPets(list);
    for (const p of list) {
      const a = await api(`/api/pets/${p.id}/album`).catch(() => null);
      if (a) setAlbums(prev => ({ ...prev, [p.id]: a.photos }));
    }
  }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);

  async function addPhoto(petId: number) {
    setErr('');
    try {
      await api(`/api/pets/${petId}/album`, { method: 'POST', body: { url: url[petId], caption: caption[petId] || '' } });
      setUrl(p => ({ ...p, [petId]: '' })); setCaption(p => ({ ...p, [petId]: '' }));
      await load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell title="我的宠物与纪念相册">
      {err && <div className="card"><div className="error" style={{ margin: 0 }}>{err}</div></div>}
      {pets.length === 0 && <div className="card empty">暂无宠物档案,预约善终服务时会自动建立</div>}
      {pets.map((p: any) => (
        <div className="card" key={p.id}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>{p.name} <span className="muted small">{SPECIES[p.species]} · {p.breed || '—'} · {Number(p.weightKg)}kg · 离世于 {fmtDT(p.deathTime)}</span></h2>
          </div>
          {p.notes && <div className="small muted">{p.notes}</div>}
          <h3 style={{ marginTop: 12 }}>纪念相册</h3>
          <div className="photo-grid">
            {(albums[p.id] || []).map((ph: any) => (
              <figure key={ph.id} style={{ margin: 0 }}>
                <img src={ph.url} alt={ph.caption} onError={(e: any) => { e.target.src = 'https://placehold.co/300x220?text=纪念'; }} />
                <figcaption className="small muted">{ph.caption}</figcaption>
              </figure>
            ))}
            {(albums[p.id] || []).length === 0 && <div className="muted small">还没有照片,上传第一张纪念照片吧</div>}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input style={{ flex: 2 }} placeholder="照片链接 URL" value={url[p.id] || ''} onChange={e => setUrl(prev => ({ ...prev, [p.id]: e.target.value }))} />
            <input style={{ flex: 1 }} placeholder="照片说明" value={caption[p.id] || ''} onChange={e => setCaption(prev => ({ ...prev, [p.id]: e.target.value }))} />
            <button className="sm" disabled={!url[p.id]} onClick={() => addPhoto(p.id)}>上传纪念照片</button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
