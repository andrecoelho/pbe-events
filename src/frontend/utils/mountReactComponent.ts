import { createRoot } from 'react-dom/client';

export function mountReactComponent(component: React.ReactElement, container: Element) {
  const root = createRoot(container);

  root.render(component);

  return () => {
    root.unmount();
  };
}
