import { Modal } from '@/components/ui/Modal';
import { ReceiptForm } from './ReceiptForm';
import type { Receipt } from '@/lib/types';
import { useToast } from '@/hooks/useToast';

interface ReceiptEditModalProps {
  open: boolean;
  receipt: Receipt | null;
  onClose: () => void;
  onSave: (r: Receipt) => void;
  onDelete: (id: string) => void;
}

export function ReceiptEditModal({
  open,
  receipt,
  onClose,
  onSave,
  onDelete,
}: ReceiptEditModalProps) {
  const { toast } = useToast();
  if (!receipt) return null;
  return (
    <Modal open={open} onClose={onClose} title="編輯記錄" size="md">
      <ReceiptForm
        initial={receipt}
        onSave={(r) => {
          onSave(r);
          toast('✅ 已更新', 'success');
          onClose();
        }}
        onDelete={() => {
          if (!confirm(`確定刪除「${receipt.store}」？`)) return;
          onDelete(receipt.id);
          toast('🗑 已刪除', 'warning');
          onClose();
        }}
        onCancel={onClose}
      />
    </Modal>
  );
}
