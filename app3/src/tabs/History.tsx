import { useState } from 'react';
import { motion } from 'framer-motion';
import type { AppState, Receipt, Category, Payment } from '@/lib/types';
import { CATEGORIES, PAYMENTS, CATEGORY_MAP } from '@/lib/constants';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface HistoryProps {
  state: AppState;
  onUpdate: (id: string, updates: Partial<Receipt>) => void;
  onDelete: (id: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function History({ state, onUpdate, onDelete, showToast }: HistoryProps) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all');
  const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);

  const filtered = state.receipts
    .filter(r => {
      const matchSearch = !search || r.store.toLowerCase().includes(search.toLowerCase()) ||
        (r.note ?? '').toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'all' || r.category === catFilter;
      return matchSearch && matchCat;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt);

  // Group by date
  const groups = filtered.reduce<Record<string, Receipt[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  function handleEdit(r: Receipt) {
    setEditReceipt({ ...r });
  }

  function saveEdit() {
    if (!editReceipt) return;
    onUpdate(editReceipt.id, editReceipt);
    setEditReceipt(null);
    showToast('已更新', 'success');
  }

  function handleDelete(id: string) {
    if (!confirm('確定刪除？')) return;
    onDelete(id);
    showToast('已刪除', 'info');
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A2E', marginBottom: 16 }}>📋 消費紀錄</div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="搜尋店名或備註…"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 12, marginBottom: 12,
          border: '1px solid rgba(255,220,210,0.8)', background: 'rgba(255,255,255,0.8)',
          fontSize: 15, color: '#1A1A2E', outline: 'none',
        }}
      />

      {/* Category filter chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }} className="scrollbar-hide">
        {(['all', ...CATEGORIES.map(c => c.id)] as Array<Category | 'all'>).map(id => {
          const cat = id === 'all' ? null : CATEGORY_MAP[id as Category];
          const isActive = catFilter === id;
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setCatFilter(id)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontSize: 13, flexShrink: 0,
                background: isActive ? (cat?.color ?? '#CC2929') : 'rgba(255,255,255,0.8)',
                color: isActive ? 'white' : '#6B7285',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {id === 'all' ? '全部' : `${cat?.icon} ${cat?.label}`}
            </motion.button>
          );
        })}
      </div>

      {dates.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6B7285', marginTop: 60, fontSize: 15 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>暫無紀錄</div>
        </div>
      ) : (
        dates.map(date => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, padding: '0 2px',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>{date}</span>
              <span className="num" style={{ fontSize: 13, color: '#CC2929', fontWeight: 600 }}>
                ¥{groups[date].reduce((s, r) => s + r.total, 0).toLocaleString()}
              </span>
            </div>
            {groups[date].map((r, i) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                rate={state.rate}
                index={i}
                onEdit={() => handleEdit(r)}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        ))
      )}

      {/* Edit modal */}
      <Modal open={!!editReceipt} onClose={() => setEditReceipt(null)} title="編輯收據">
        {editReceipt && (
          <EditForm
            data={editReceipt}
            onChange={setEditReceipt}
            onSave={saveEdit}
            onCancel={() => setEditReceipt(null)}
            persons={state.persons}
          />
        )}
      </Modal>
    </div>
  );
}

function ReceiptCard({ receipt, rate, index, onEdit, onDelete }: {
  receipt: Receipt;
  rate: number;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = CATEGORY_MAP[receipt.category];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass"
      style={{ borderRadius: 14, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${cat?.color ?? '#6b7280'}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>
        {cat?.icon ?? '📦'}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onEdit} role="button">
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {receipt.store}
        </div>
        <div style={{ fontSize: 11, color: '#6B7285' }}>
          {cat?.label} · {receipt.payment} {receipt.region ? `· ${receipt.region}` : ''}
        </div>
        {receipt.note && <div style={{ fontSize: 11, color: '#6B7285', marginTop: 2 }}>{receipt.note}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div className="num" style={{ fontSize: 16, fontWeight: 700, color: '#CC2929' }}>
          ¥{receipt.total.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: '#6B7285' }}>
          ≈{(receipt.total / rate).toFixed(0)} HKD
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onEdit}
            style={{ background: 'rgba(204,41,41,0.1)', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 12, color: '#CC2929' }}
          >
            ✏️
          </motion.button>
          <motion.button
            whileTap={{ rotate: -8, scale: 0.85 }}
            onClick={onDelete}
            style={{ background: 'rgba(204,41,41,0.1)', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 12, color: '#CC2929' }}
          >
            🗑️
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function EditForm({ data, onChange, onSave, onCancel, persons }: {
  data: Receipt;
  onChange: (r: Receipt) => void;
  onSave: () => void;
  onCancel: () => void;
  persons: AppState['persons'];
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid rgba(255,220,210,0.8)', background: 'rgba(255,255,255,0.8)',
    fontSize: 15, color: '#1A1A2E', outline: 'none', marginBottom: 10,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#6B7285', marginBottom: 4, display: 'block',
  };

  return (
    <div>
      <label style={labelStyle}>店名</label>
      <input style={inputStyle} value={data.store} onChange={e => onChange({ ...data, store: e.target.value })} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>金額 (JPY)</label>
          <input style={inputStyle} type="number" value={data.total}
            onChange={e => onChange({ ...data, total: Number(e.target.value) })} />
        </div>
        <div>
          <label style={labelStyle}>日期</label>
          <input style={inputStyle} type="date" value={data.date}
            onChange={e => onChange({ ...data, date: e.target.value })} />
        </div>
      </div>

      <label style={labelStyle}>類別</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {CATEGORIES.map(c => (
          <motion.button
            key={c.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange({ ...data, category: c.id as Category })}
            style={{
              padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: data.category === c.id ? c.color : 'rgba(0,0,0,0.06)',
              color: data.category === c.id ? 'white' : '#1A1A2E',
            }}
          >
            {c.icon} {c.label}
          </motion.button>
        ))}
      </div>

      <label style={labelStyle}>支付</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {PAYMENTS.map(p => (
          <motion.button
            key={p.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange({ ...data, payment: p.id as Payment })}
            style={{
              flex: 1, padding: '6px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11,
              background: data.payment === p.id ? '#CC2929' : 'rgba(0,0,0,0.06)',
              color: data.payment === p.id ? 'white' : '#1A1A2E',
            }}
          >
            {p.icon} {p.label}
          </motion.button>
        ))}
      </div>

      <label style={labelStyle}>地區</label>
      <input style={inputStyle} value={data.region ?? ''} onChange={e => onChange({ ...data, region: e.target.value })} />

      <label style={labelStyle}>品項</label>
      <textarea
        style={{ ...inputStyle, height: 70, resize: 'vertical' }}
        value={data.itemsText ?? ''}
        onChange={e => onChange({ ...data, itemsText: e.target.value })}
      />

      <label style={labelStyle}>備註</label>
      <input style={inputStyle} value={data.note ?? ''} onChange={e => onChange({ ...data, note: e.target.value })} />

      {persons.length > 0 && (
        <>
          <label style={labelStyle}>誰付</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange({ ...data, personId: undefined })}
              style={{
                padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: !data.personId ? '#CC2929' : 'rgba(0,0,0,0.06)',
                color: !data.personId ? 'white' : '#1A1A2E',
              }}
            >共同</motion.button>
            {persons.map(p => (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => onChange({ ...data, personId: p.id })}
                style={{
                  padding: '5px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: data.personId === p.id ? p.color : 'rgba(0,0,0,0.06)',
                  color: data.personId === p.id ? 'white' : '#1A1A2E',
                }}
              >{p.emoji} {p.name}</motion.button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Button variant="secondary" onClick={onCancel} className="flex-1">取消</Button>
        <Button variant="primary" onClick={onSave} className="flex-1">儲存</Button>
      </div>
    </div>
  );
}
