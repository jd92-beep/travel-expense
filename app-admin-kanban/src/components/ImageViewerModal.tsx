export function ImageViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content image-modal">
        <button onClick={onClose} className="modal-close" type="button">&times;</button>
        <img src={url} alt="Receipt" className="receipt-image-preview" />
      </div>
    </div>
  );
}
