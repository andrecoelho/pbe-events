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

    const handleNavigate = (event: any) => {
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
    setView(new URL(window.location.href));

    return store;
  }, [routes]);

  const page = useSnapshot(routerStore).page as ElementType;

  return page;
};
