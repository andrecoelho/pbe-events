import { modal } from '@/frontend/components/Modal';

function AlertModal(props: { message: string }) {
  const handleClick = () => {
    alertModal.close();
  };

  return (
    <div className="modal-box">
      <h3 className="font-bold text-lg mb-4">Alert</h3>
      <p className="mb-4">{props.message}</p>
      <div className='modal-action flex justify-end'>
        <button className='btn btn-primary' onClick={handleClick}>OK</button>
      </div>
    </div>
  );
}

AlertModal.displayName = 'AlertModal';

class AlertModalManager {
  async open(message: string) {
    return await modal.open<string>(<AlertModal message={message} />);
  }

  close() {
    modal.close();
  }
}

export const alertModal = new AlertModalManager();
