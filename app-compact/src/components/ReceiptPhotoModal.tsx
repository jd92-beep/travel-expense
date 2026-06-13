import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import type { Receipt } from '../lib/types';
import { safePhotoUrl } from '../lib/domain';
import { useModalAccessibility } from '../lib/useModalAccessibility';

export function ReceiptPhotoModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const stableOnClose = useCallback(() => onClose(), [onClose]);
  const containerRef = useModalAccessibility(true, stableOnClose);
  const photoSrc = safePhotoUrl(receipt.photoUrl, receipt.photoThumb);
  const [imgSrc, setImgSrc] = useState(photoSrc);
  const [error, setError] = useState(!photoSrc);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  const handleImgError = () => {
    if (!fallbackAttempted) {
      setFallbackAttempted(true);
      const thumbSrc = safePhotoUrl(receipt.photoThumb);
      if (thumbSrc && thumbSrc !== imgSrc) {
        console.log('[ReceiptPhotoModal] Main image load failed. Falling back to thumbnail.');
        setImgSrc(thumbSrc);
      } else {
        console.log('[ReceiptPhotoModal] Main image load failed. No valid thumbnail available.');
        setError(true);
      }
    } else {
      console.log('[ReceiptPhotoModal] Thumbnail fallback failed as well.');
      setError(true);
    }
  };

  return createPortal(
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        zIndex: 9999,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'fixed',
        inset: 0
      }}
    >
      <div
        className="flex justify-center items-center p-2 w-full max-h-[90vh] overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative max-w-full max-h-[85vh] flex flex-col items-center">
          {!error && imgSrc ? (
            <img
              src={imgSrc}
              alt="Receipt"
              className="max-w-[90vw] max-h-[75vh] rounded-2xl object-contain shadow-2xl animate-fade-in border border-white/20"
              onError={handleImgError}
            />
          ) : (
            <div className="photo-error-fallback flex flex-col items-center justify-center p-6 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-center max-w-[340px] shadow-2xl">
              <span style={{ fontSize: '48px', marginBottom: '12px' }}>📷</span>
              <h4 className="text-white font-bold text-lg mb-2">收據相片加載失敗</h4>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Notion 嘅安全圖片連結已失效（過期1小時）。<br />請到「設定」重新同步以刷新連結！
              </p>
              {photoSrc && (
                <a
                  href={photoSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 text-white font-semibold text-sm hover:bg-red-700 active:scale-95 transition-all shadow-md"
                >
                  <ExternalLink size={16} />
                  在新分頁打開原始相片
                </a>
              )}
            </div>
          )}
          <button
            className="icon-btn absolute -top-4 -right-4 bg-white/10 text-white border border-white/20 hover:bg-white/25 hover:rotate-90 transition-all rounded-full p-2"
            type="button"
            onClick={onClose}
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
