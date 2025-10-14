import { mountReactComponent } from '@/frontend/utils/mountReactComponent';

class Modal {
  private dialogElement?: HTMLDialogElement;
  private promise?: Promise<any>;
  private unmount?: () => void;
  private resolve?: (value: any) => void;
  private isOpen = false;
  private value: any;

  private handleTransitionEnd = (event: TransitionEvent) => {
    if (!this.isOpen && event.propertyName === 'visibility') {
      this.cleanup();
    }
  };

  private handleClose = () => {
    this.isOpen = false;
  };

  private cleanup() {
    this.unmount?.();
    this.dialogElement?.remove();
    this.resolve?.(this.value);

    this.isOpen = false;

    delete this.value;
    delete this.promise;
    delete this.resolve;
    delete this.unmount;
    delete this.dialogElement;
  }

  async open<T>(content: React.ReactElement) {
    await this.promise;

    const { promise, resolve } = Promise.withResolvers<T>();

    this.promise = promise;
    this.resolve = resolve;
    this.isOpen = true;
    this.dialogElement = document.createElement('dialog');

    this.dialogElement.className = 'modal';

    document.body.appendChild(this.dialogElement);

    this.unmount = mountReactComponent(content, this.dialogElement);

    this.dialogElement.showModal();
    this.dialogElement.addEventListener('transitionend', this.handleTransitionEnd);
    this.dialogElement.addEventListener('close', this.handleClose);

    return await promise;
  }

  close<T>(value?: T) {
    this.value = value;
    this.dialogElement?.close();
  }
}

export const modal = new Modal();
