import { onlineCountValueEl } from './dom.js';
import { BACKEND_HOST } from './config.js';

const ONLINE_COUNT_POLL_MS = 5000;
let onlineCountInterval = null;

async function fetchOnlineCount() {
  try {
    const res = await fetch(`https://${BACKEND_HOST}/api/online-count`);
    const data = await res.json();
    onlineCountValueEl.textContent = data.count;
  } catch {
    onlineCountValueEl.textContent = '--';
  }
}

export function startOnlineCountPolling() {
  fetchOnlineCount();
  if (!onlineCountInterval) {
    onlineCountInterval = setInterval(fetchOnlineCount, ONLINE_COUNT_POLL_MS);
  }
}

export function stopOnlineCountPolling() {
  if (onlineCountInterval) {
    clearInterval(onlineCountInterval);
    onlineCountInterval = null;
  }
}
