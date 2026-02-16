// Background service worker - handles sending data to backend
const BACKEND_URL = 'https://saban-api.skeptrune.com';

let totalCaptured = 0;

// Get auth token from storage
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (data) => {
      resolve(data.authToken || null);
    });
  });
}

// Get auth headers
async function getAuthHeaders() {
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Handle messages from content scripts
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

  if (message.type === 'get_auth_status') {
    chrome.storage.local.get(['authToken', 'user', 'organization'], (data) => {
      sendResponse({
        isAuthenticated: !!data.authToken,
        user: data.user || null,
        organization: data.organization || null,
      });
    });
    return true;
  }

  if (message.type === 'logout') {
    chrome.storage.local.remove(['authToken', 'user', 'organization'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'save_auth') {
    // Save auth data from content script (web app auth page)
    chrome.storage.local.set(
      {
        authToken: message.token,
        user: message.user,
        organization: message.organization,
      },
      () => {
        console.log('[Background] Auth saved from web app');
        sendResponse({ success: true });
      }
    );
    return true;
  }
});

// Handle messages from web app (external)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Background] External message from:', sender.url, message);

  if (message.type === 'AUTH_TOKEN') {
    // Store auth data from web app
    chrome.storage.local.set(
      {
        authToken: message.token,
        user: message.user,
        organization: message.organization,
      },
      () => {
        console.log('[Background] Auth token saved');
        sendResponse({ success: true });
      }
    );
    return true;
  }

  if (message.type === 'PING') {
    // Web app checking if extension is installed
    sendResponse({ success: true, version: chrome.runtime.getManifest().version });
    return true;
  }
});

async function sendToBackend(profiles, sourceProfileUrl, sourceSection) {
  console.log('[Background] Sending to backend:', BACKEND_URL, 'section:', sourceSection);

  const headers = await getAuthHeaders();
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Not authenticated. Please login via the extension popup.');
  }

  const response = await fetch(`${BACKEND_URL}/profiles`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profiles, sourceProfileUrl, sourceSection }),
  });

  if (response.status === 401) {
    // Clear invalid token
    chrome.storage.local.remove(['authToken', 'user', 'organization']);
    throw new Error('Session expired. Please login again.');
  }

  if (response.status === 403) {
    throw new Error('No organization selected. Please login and select an organization.');
  }

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
