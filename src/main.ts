import './styles.css';
import { ensureUser } from './firebase';
import { startApp } from './ui/app';

async function boot() {
  const uid = await ensureUser();
  await startApp(uid);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

void boot();
