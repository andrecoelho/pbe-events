import { modal } from '@/frontend/components/Modal';

function ConfirmModal(props: { message: string }) {
  const handleCancel = () => confirmModal.close(false);
  const handleConfirm = () => confirmModal.close(true);

  return (
    <div className="modal-box">
      <h3 className="font-bold text-lg mb-4">Confirm</h3>
      <p className="mb-4">{props.message}</p>
      <div className="modal-action flex justify-between">
        <button className="btn btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleConfirm}>
          Confirm
        </button>
      </div>
    </div>
  );
}

ConfirmModal.displayName = 'ConfirmModal';

class ConfirmModalManager {
  async open(message: string) {
    return await modal.open<boolean>(<ConfirmModal message={message} />);
  }

  close(confirmation: boolean) {
    modal.close(confirmation);
  }
}

export const confirmModal = new ConfirmModalManager();
