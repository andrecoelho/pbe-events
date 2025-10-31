let toastContainer: HTMLDivElement | null = null;

function getToastContainer(): HTMLDivElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast toast-bottom toast-start';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '0.5rem';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message: string) {
  const container = getToastContainer();

  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.innerHTML = `<span>${message}</span>`;

  // Insert at the beginning (bottom due to flex-direction: column)
  container.appendChild(alert);

  setTimeout(() => {
    alert.remove();

    // Clean up container if no toasts left
    if (container.children.length === 0 && toastContainer) {
      toastContainer.remove();
      toastContainer = null;
    }
  }, 3000);
}
