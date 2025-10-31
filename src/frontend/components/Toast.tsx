import { Icon } from '@/frontend/components/Icon';
import { mountReactComponent } from '@/frontend/utils/mountReactComponent';

type ToastType = 'info' | 'success' | 'error';

interface ShowToastOptions {
  message: string;
  type?: ToastType;
  persist?: boolean;
}

interface ToastProps {
  message: string;
  type: ToastType;
  persist: boolean;
  onClose: () => void;
}

function ToastComponent({ message, type, persist, onClose }: ToastProps) {
  const alertClass = `alert ${type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info'}`;

  return (
    <div className={alertClass}>
      <span>{message}</span>
      {persist && <Icon name='x-mark' className='size-4 cursor-pointer hover:brightness-75' onClick={onClose} />}
    </div>
  );
}

interface ActiveToast {
  element: HTMLDivElement;
  unmount: () => void;
  timeoutId?: number;
}

class ToastManager {
  private container?: HTMLDivElement;
  private activeToasts = new Map<number, ActiveToast>();
  private nextId = 0;

  private getContainer(): HTMLDivElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast toast-bottom toast-start';
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.gap = '0.5rem';
      document.body.appendChild(this.container);
    }

    return this.container;
  }

  private removeToast(id: number) {
    const activeToast = this.activeToasts.get(id);

    if (!activeToast) {
      return;
    }

    if (activeToast.timeoutId) {
      clearTimeout(activeToast.timeoutId);
    }

    activeToast.unmount();
    activeToast.element.remove();
    this.activeToasts.delete(id);

    // Clean up container if no toasts left
    if (this.activeToasts.size === 0 && this.container) {
      this.container.remove();
      this.container = undefined;
    }
  }

  show(options: ShowToastOptions): void;
  show(message: string): void;
  show(optionsOrMessage: ShowToastOptions | string): void {
    const message = typeof optionsOrMessage === 'string' ? optionsOrMessage : optionsOrMessage.message;
    const type = typeof optionsOrMessage === 'string' ? 'info' : optionsOrMessage.type ?? 'info';
    const persist = typeof optionsOrMessage === 'string' ? false : optionsOrMessage.persist ?? false;

    const container = this.getContainer();
    const toastId = this.nextId++;
    const toastElement = document.createElement('div');

    container.appendChild(toastElement);

    const handleClose = () => {
      this.removeToast(toastId);
    };

    const unmount = mountReactComponent(
      <ToastComponent message={message} type={type} persist={persist} onClose={handleClose} />,
      toastElement
    );

    const activeToast: ActiveToast = {
      element: toastElement,
      unmount
    };

    if (!persist) {
      activeToast.timeoutId = window.setTimeout(() => {
        this.removeToast(toastId);
      }, 3000);
    }

    this.activeToasts.set(toastId, activeToast);
  }
}

export const toast = new ToastManager();
