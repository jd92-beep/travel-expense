import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppState, Receipt, Category, Payment } from '@/lib/types';
import { CATEGORIES, PAYMENTS, ITINERARY } from '@/lib/constants';
import { scanWithGemini, imageToBase64 } from '@/lib/gemini';
import { todayHKT } from '@/lib/itinerary';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useRipple } from '@/hooks/useRipple';

interface ScanProps {
  state: AppState;
  onAdd: (r: Receipt) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface ConfirmData {
  store: string;
  total: string;
  date: string;
  time: string;
  category: Category;
  payment: Payment;
  itemsText: string;
  note: string;
  region: string;
  personId: string;
  photoThumb?: string;
}

export function Scan({ state, onAdd, showToast }: ScanProps) {
  const [scanning, setScanning] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [thumbOpen, setThumbOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmData>({
    store: '', total: '', date: todayHKT(), time: '',
    category: 'food', payment: 'cash', itemsText: '', note: '', region: '', personId: '',
  });
  const today = todayHKT();
  const todayDay = ITINERARY.find(d => d.date === today);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { triggerRipple: triggerCamera, RippleLayer: CameraRipple } = useRipple();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!state.apiKey) { showToast('請先在設定中輸入 Gemini API Key', 'error'); return; }
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 300);
    setScanning(true);
    try {
      const { base64, mime } = await imageToBase64(file);
      const result = await scanWithGemini(base64, mime, state.apiKey, state.scanModel);
      setConfirm({
        store: result.store ?? '',
        total: String(result.total ?? ''),
        date: result.date ?? todayHKT(),
        time: result.time ?? '',
        category: result.category ?? 'food',
        payment: result.payment ?? 'cash',
        itemsText: result.items ?? '',
        note: result.note ?? '',
        region: result.region ?? todayDay?.region ?? '',
        personId: '',
        photoThumb: `data:${mime};base64,${base64}`,
      });
      setConfirmOpen(true);
    } catch (e) {
      showToast(`掃描失敗: ${(e as Error).message}`, 'error');
    } finally {
      setScanning(false);
    }
  }

  function saveConfirm() {
    const r: Receipt = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      store: confirm.store,
      total: Number(confirm.total) || 0,
      date: confirm.date,
      time: confirm.time || undefined,
      category: confirm.category,
      payment: confirm.payment,
      region: confirm.region || undefined,
      itemsText: confirm.itemsText || undefined,
      note: confirm.note || undefined,
      personId: confirm.personId || undefined,
      photoThumb: confirm.photoThumb,
      createdAt: Date.now(),
    };
    onAdd(r);
    setConfirmOpen(false);
    showToast('已儲存收據 ✓', 'success');
  }

  function openManual() {
    setConfirm({
      store: '', total: '', date: todayHKT(), time: '',
      category: 'food', payment: 'cash', itemsText: '', note: '',
      region: todayDay?.region ?? '', personId: '',
    });
    setManualOpen(true);
  }

  function voiceInput() {
    showToast('語音輸入功能開發中', 'info');
  }

  function handleEmailSync() {
    showToast('Email 同步功能開發中', 'info');
  }

  return (
    <div style={{ padding: '24px 16px 100px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A2E', marginBottom: 20 }}>
        📷 掃描收據
      </div>

      {/* Camera button */}
      <motion.button
        onClick={(e) => { triggerCamera(e); cameraRef.current?.click(); }}
        whileTap={{ scale: 0.93, y: 1 }}
        whileHover={{ scale: 1.02, y: -1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        disabled={scanning}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg,#1B2D55,#3060A0)',
          border: 'none',
          borderRadius: 20,
          padding: '28px 20px',
          color: 'white',
          cursor: scanning ? 'wait' : 'pointer',
          marginBottom: 12,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(27,45,85,0.35)',
        }}
      >
        <CameraRipple />
        {/* Pulse ring */}
        {!scanning && (
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: 24,
              border: '3px solid rgba(255,255,255,0.3)',
              pointerEvents: 'none',
            }}
          />
        )}
        <div style={{ fontSize: 44, marginBottom: 8 }}>
          {scanning ? '⏳' : '📸'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          {scanning ? 'AI 辨識中…' : '拍攝收據'}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          {scanning ? '請稍候' : '即時 AI OCR + 翻譯'}
        </div>
      </motion.button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />

      {/* Gallery button */}
      <motion.button
        onClick={() => fileRef.current?.click()}
        whileTap={{ scale: 0.93, y: 1 }}
        whileHover={{ scale: 1.02, y: -1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg,#065f46,#059669)',
          border: 'none',
          borderRadius: 16,
          padding: '18px 20px',
          color: 'white',
          cursor: 'pointer',
          marginBottom: 16,
          fontSize: 15,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: '0 4px 16px rgba(5,150,105,0.3)',
        }}
      >
        <span style={{ fontSize: 22 }}>🖼️</span>
        從相簿選取
      </motion.button>
      <input ref={fileRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />

      {/* 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { icon: '⚡', label: 'Email 同步', sub: '解析 booking email', color: '#7c3aed', fn: handleEmailSync },
          { icon: '🎤', label: '語音輸入', sub: '說出消費', color: '#db2777', fn: voiceInput },
          { icon: '✏️', label: '手動記帳', sub: '自行填寫', color: '#d97706', fn: openManual },
          { icon: '📋', label: '貼文字', sub: '文字描述辨識', color: '#0891b2', fn: () => showToast('開發中', 'info') },
        ].map(btn => (
          <motion.button
            key={btn.label}
            onClick={btn.fn}
            whileTap={{ scale: 0.93, y: 1 }}
            whileHover={{ scale: 1.02, y: -1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="glass"
            style={{
              border: 'none',
              borderRadius: 16,
              padding: '18px 14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 28 }}>{btn.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{btn.label}</span>
            <span style={{ fontSize: 12, color: '#6B7285' }}>{btn.sub}</span>
          </motion.button>
        ))}
      </div>

      {/* Shutter flash overlay */}
      <AnimatePresence>
        {flashVisible && (
          <motion.div
            key="flash"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'fixed', inset: 0, background: 'white',
              zIndex: 500, pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirm modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="確認收據">
        <ConfirmForm
          data={confirm}
          onChange={setConfirm}
          onSave={saveConfirm}
          onCancel={() => setConfirmOpen(false)}
          persons={state.persons}
          onThumbClick={() => setThumbOpen(true)}
        />
      </Modal>

      {/* Manual modal */}
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="手動記帳">
        <ConfirmForm
          data={confirm}
          onChange={setConfirm}
          onSave={() => { saveConfirm(); setManualOpen(false); }}
          onCancel={() => setManualOpen(false)}
          persons={state.persons}
        />
      </Modal>

      {/* Thumb lightbox */}
      <AnimatePresence>
        {thumbOpen && confirm.photoThumb && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setThumbOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
              zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={confirm.photoThumb}
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ConfirmFormProps {
  data: ConfirmData;
  onChange: (d: ConfirmData) => void;
  onSave: () => void;
  onCancel: () => void;
  persons: AppState['persons'];
  onThumbClick?: () => void;
}

function ConfirmForm({ data, onChange, onSave, onCancel, persons, onThumbClick }: ConfirmFormProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid rgba(255,220,210,0.8)',
    background: 'rgba(255,255,255,0.8)', fontSize: 15, color: '#1A1A2E',
    outline: 'none', marginBottom: 10,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#6B7285', marginBottom: 4, display: 'block',
  };

  return (
    <div>
      {data.photoThumb && (
        <div style={{ marginBottom: 14 }}>
          <motion.img
            src={data.photoThumb}
            onClick={onThumbClick}
            whileTap={{ scale: 0.97 }}
            style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12, cursor: 'pointer' }}
          />
        </div>
      )}
      <label style={labelStyle}>店名</label>
      <input style={inputStyle} value={data.store} onChange={e => onChange({ ...data, store: e.target.value })} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>金額 (JPY)</label>
          <input style={inputStyle} type="number" value={data.total} onChange={e => onChange({ ...data, total: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>日期</label>
          <input style={inputStyle} type="date" value={data.date} onChange={e => onChange({ ...data, date: e.target.value })} />
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
              transition: 'all 0.15s',
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
              transition: 'all 0.15s',
            }}
          >
            {p.icon} {p.label}
          </motion.button>
        ))}
      </div>

      <label style={labelStyle}>地區</label>
      <input style={inputStyle} value={data.region} onChange={e => onChange({ ...data, region: e.target.value })} />

      <label style={labelStyle}>品項</label>
      <textarea
        style={{ ...inputStyle, height: 80, resize: 'vertical' }}
        value={data.itemsText}
        onChange={e => onChange({ ...data, itemsText: e.target.value })}
      />

      <label style={labelStyle}>備註</label>
      <input style={inputStyle} value={data.note} onChange={e => onChange({ ...data, note: e.target.value })} />

      {persons.length > 0 && (
        <>
          <label style={labelStyle}>誰付</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => onChange({ ...data, personId: '' })}
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
        <Button variant="primary" onClick={onSave} className="flex-1">
          儲存 ✓
        </Button>
      </div>
    </div>
  );
}
