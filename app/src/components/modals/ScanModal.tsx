import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Image as ImageIcon, Loader2, RefreshCcw, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ReceiptForm } from './ReceiptForm';
import { useToast } from '@/hooks/useToast';
import { fileToBase64, prepareForOCR, scanReceipt } from '@/lib/scan';
import type { Receipt, ScanResult } from '@/lib/types';
import { rid } from '@/lib/utils';

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (r: Receipt) => void;
  apiKey?: string;
  preferredModel?: string;
  defaultRegion?: string;
}

type Phase = 'pick' | 'scanning' | 'confirm' | 'error';

export function ScanModal({
  open,
  onClose,
  onSave,
  apiKey,
  preferredModel,
  defaultRegion,
}: ScanModalProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [preview, setPreview] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScanResult | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [lastB64, setLastB64] = useState<{ base64: string; mime: string } | null>(null);
  const { toast } = useToast();

  const reset = () => {
    setPhase('pick');
    setPreview(null);
    setScanned(null);
    setModelUsed('');
    setError('');
    setLastB64(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!apiKey) {
      toast('⚠️ 未設定 Gemini API Key · 請去設定', 'warning');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setPhase('scanning');
    setError('');
    try {
      const raw = await fileToBase64(file);
      const prepped = await prepareForOCR(raw.base64, raw.mime);
      setLastB64(prepped);
      const { result, modelUsed } = await scanReceipt(
        prepped.base64,
        prepped.mime,
        apiKey,
        preferredModel,
      );
      setScanned(result);
      setModelUsed(modelUsed);
      setPhase('confirm');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const retry = async () => {
    if (!lastB64 || !apiKey) return;
    setPhase('scanning');
    setError('');
    try {
      const { result, modelUsed } = await scanReceipt(
        lastB64.base64,
        lastB64.mime,
        apiKey,
        preferredModel,
      );
      setScanned(result);
      setModelUsed(modelUsed);
      setPhase('confirm');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const handleSave = (r: Receipt) => {
    onSave(r);
    handleClose();
    toast('✅ 記錄已儲存', 'success');
  };

  // Build initial Receipt from scan result for the form
  const buildInitial = (): Partial<Receipt> | undefined => {
    if (!scanned) return undefined;
    return {
      id: rid(),
      store: scanned.store,
      total: scanned.total ?? 0,
      date: scanned.date,
      time: scanned.time || undefined,
      category: scanned.category,
      payment: scanned.payment || 'credit',
      region: defaultRegion,
      itemsText: scanned.items?.length
        ? scanned.items
            .map((it) => `${it.name_jp || it.name} ¥${it.price ?? '?'}`)
            .join('\n')
        : undefined,
      note: scanned.note || undefined,
      subtotal: scanned.subtotal,
      tax: scanned.tax,
      address: scanned.address || undefined,
      bookingRef: scanned.booking_ref || undefined,
      confidence: scanned.confidence,
    };
  };

  return (
    <Modal open={open} onClose={handleClose} title="掃描收據" size="md">
      {phase === 'pick' && (
        <div className="p-5 space-y-3">
          <p className="text-xs text-ink-400">影張相或者揀相，AI 會自動辨識收據內容</p>
          <div className="grid grid-cols-2 gap-3">
            <ActionBtn
              icon={<Camera size={24} />}
              label="拍照"
              desc="開相機影"
              color="#ef4135"
              onClick={() => cameraRef.current?.click()}
            />
            <ActionBtn
              icon={<ImageIcon size={24} />}
              label="相簿"
              desc="揀相片"
              color="#f59e0b"
              onClick={() => galleryRef.current?.click()}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setScanned({
                store: '',
                total: 0,
                date: new Date().toISOString().slice(0, 10),
                category: 'food',
                payment: 'credit',
              });
              setPhase('confirm');
            }}
            className="w-full mt-2 text-xs text-ink-400 hover:text-ink-200 underline underline-offset-4"
          >
            或者 手動輸入
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {phase === 'scanning' && (
        <div className="p-8 text-center space-y-4">
          {preview && (
            <img
              src={preview}
              alt=""
              className="max-h-48 mx-auto rounded-xl object-contain opacity-70"
            />
          )}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
          >
            <Loader2 size={32} className="text-arsenal-400" />
          </motion.div>
          <div className="text-sm text-ink-200">AI 正在辨識收據…</div>
          <div className="text-[11px] text-ink-400">通常需要 3–10 秒</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="p-6 space-y-4 text-center">
          <AlertTriangle size={32} className="mx-auto text-rose-400" />
          <div className="text-sm text-rose-300">辨識失敗</div>
          <div className="text-[11px] text-ink-400 break-words">{error}</div>
          <div className="flex gap-2 justify-center">
            {lastB64 && (
              <Button size="sm" variant="secondary" onClick={retry}>
                <RefreshCcw size={13} /> 重試
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setScanned({
                  store: '',
                  total: 0,
                  date: new Date().toISOString().slice(0, 10),
                  category: 'food',
                  payment: 'credit',
                });
                setPhase('confirm');
              }}
            >
              手動輸入
            </Button>
          </div>
        </div>
      )}

      {phase === 'confirm' && scanned && (
        <>
          {preview && (
            <div className="px-5 pt-4">
              <img
                src={preview}
                alt=""
                className="max-h-40 w-full object-contain rounded-xl border border-white/5"
              />
              {modelUsed && (
                <div className="text-[10px] text-ink-400 mt-2 text-center">
                  ✓ {modelUsed}
                  {scanned.confidence && ` · 信心度 ${scanned.confidence}`}
                </div>
              )}
            </div>
          )}
          <ReceiptForm
            initial={buildInitial()}
            onSave={handleSave}
            onCancel={handleClose}
            submitLabel="確認儲存"
          />
        </>
      )}
    </Modal>
  );
}

function ActionBtn({
  icon,
  label,
  desc,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="glass rounded-2xl p-4 text-left"
    >
      <div
        className="h-12 w-12 rounded-xl grid place-items-center mb-2 border border-white/5"
        style={{
          background: `linear-gradient(135deg, ${color}38 0%, ${color}0a 100%)`,
          color,
        }}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-ink-100">{label}</div>
      <div className="text-[11px] text-ink-400 mt-0.5">{desc}</div>
    </motion.button>
  );
}
