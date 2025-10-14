import '../base.css';

import { useRouter, type Routes } from '@/frontend/utils/useRouter';
import { NavBar } from './NavBar';

const routes: Routes = new Map([]);

export function App() {
  const Page = useRouter(routes);

  return (
    <div className="absolute inset-0 flex flex-col">
      <NavBar />
      <Page />
    </div>
  );
}
