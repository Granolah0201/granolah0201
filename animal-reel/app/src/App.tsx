import { useEffect } from 'react';
import { ProgressOverlay } from './components/Feedback';
import Shell from './components/Shell';
import Editor from './screens/Editor';
import Home from './screens/Home';
import Library from './screens/Library';
import References from './screens/References';
import Settings from './screens/Settings';
import { routeFromHash, useStore } from './store';

export default function App() {
  const { route, navigate, refreshPresets, refreshProjects } = useStore();

  useEffect(() => {
    void refreshPresets();
    void refreshProjects();
    navigate(routeFromHash());
    const onHash = () => useStore.setState({ route: routeFromHash() });
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell>
      {route === 'home' && <Home />}
      {route === 'editor' && <Editor />}
      {route === 'references' && <References />}
      {route === 'library' && <Library />}
      {route === 'settings' && <Settings />}
      <ProgressOverlay />
    </Shell>
  );
}
