import { type ElementType, useMemo } from 'react';
import { proxy, useSnapshot } from 'valtio';

interface RouterStore {
  page: ElementType;
}

const NotFound = () => null;

export type Routes = Map<RegExp, ElementType>;

export const useRouter = (routes: Routes) => {
  const routerStore = useMemo(() => {
    const store = proxy<RouterStore>({ page: NotFound });

    const setView = (url: URL) => {
      for (const [pattern, component] of routes) {
        if (pattern.test(url.pathname)) {
          store.page = component;
          return;
        }
      }

      store.page = NotFound;
    };

    // @ts-expect-error - Navigation API is not fully typed yet
    if (window.navigation && window.navigation.addEventListener) {
      // Modern Navigation API (Chrome, Edge, etc.)
      const handleNavigate = (event: any) => {
        if (event.downloadRequest !== null) {
          return;
        }

        const url = new URL(event.destination.url);

        if (event.navigationType === 'reload' || url.origin !== window.location.origin) {
          return;
        }

        event.intercept({
          handler() {
            setView(url);
          }
        });
      };

      // @ts-expect-error
      window.navigation.addEventListener('navigate', handleNavigate);
    } else {
      // Fallback for browsers without Navigation API (Safari, Firefox, etc.)
      // Handle back/forward navigation
      const handlePopState = () => {
        setView(new URL(window.location.href));
      };

      window.addEventListener('popstate', handlePopState);

      // Intercept link clicks for same-origin navigation
      const handleClick = (event: MouseEvent) => {
        const target = (event.target as HTMLElement).closest('a');

        if (!target) return;

        const href = target.getAttribute('href');
        if (!href) return;

        // Ignore external links, modified clicks, and download links
        if (
          target.target === '_blank' ||
          target.hasAttribute('download') ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        try {
          const url = new URL(href, window.location.href);

          // Only intercept same-origin navigation
          if (url.origin !== window.location.origin) {
            return;
          }

          event.preventDefault();

          // Update URL and view
          if (url.href !== window.location.href) {
            window.history.pushState({}, '', url.href);
            setView(url);
          }
        } catch {
          // Invalid URL, let browser handle it
        }
      };

      document.addEventListener('click', handleClick);
    }

    setView(new URL(window.location.href));

    return store;
  }, [routes]);

  const page = useSnapshot(routerStore).page as ElementType;

  return page;
};
