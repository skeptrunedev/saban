// Background service worker - handles sending data to backend
const BACKEND_URL = 'http://localhost:3847/profiles';

let totalCaptured = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'profiles_captured') {
    console.log('[Background] Received profiles:', message.profiles.length);

    // POST to backend
    sendToBackend(message.profiles, message.sourceProfileUrl, message.sourceSection)
      .then((result) => {
        totalCaptured += result.inserted || 0;
        chrome.storage.local.set({
          totalCaptured: totalCaptured,
          lastUpdate: Date.now(),
        });
        sendResponse({ success: true, ...result });
      })
      .catch((err) => {
        console.error('[Background] Error sending to backend:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep channel open for async response
  }

  if (message.type === 'get_stats') {
    chrome.storage.local.get(['totalCaptured', 'lastUpdate'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

async function sendToBackend(profiles, sourceProfileUrl, sourceSection) {
  console.log('[Background] Sending to backend:', BACKEND_URL, 'section:', sourceSection);

  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles, sourceProfileUrl, sourceSection }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const data = await response.json();
  console.log('[Background] Backend response:', data);
  return data;
}

// Reset counter on extension load
chrome.storage.local.set({ totalCaptured: 0, lastUpdate: Date.now() });

console.log('[Background] Service worker started');
