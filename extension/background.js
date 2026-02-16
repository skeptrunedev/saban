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

    // Check if any profiles need member URN resolution
    const needsResolution = message.profiles.some(
      (p) => p.vanityName && p.vanityName.startsWith('ACo')
    );

    const processAndSend = async () => {
      let profiles = message.profiles;

      // Resolve member URN profiles if needed
      if (needsResolution) {
        console.log('[Background] Some profiles need member URN resolution...');
        profiles = await resolveProfiles(profiles);
      }

      // Send to backend
      return sendToBackend(profiles, message.sourceProfileUrl, message.sourceSection);
    };

    processAndSend()
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

// Convert image URL to data URL
async function imageToDataUrl(url) {
  if (!url || !url.startsWith('http')) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log('[Background] Failed to fetch image:', url, response.status);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.log('[Background] Error converting image:', url, err.message);
    return null;
  }
}

// Convert profile picture URLs to data URLs (in batches to avoid overwhelming)
async function convertProfileImages(profiles) {
  const BATCH_SIZE = 5;
  const converted = [...profiles];

  for (let i = 0; i < converted.length; i += BATCH_SIZE) {
    const batch = converted.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (profile, idx) => {
        if (profile.profilePictureUrl && !profile.profilePicturePayload) {
          const dataUrl = await imageToDataUrl(profile.profilePictureUrl);
          if (dataUrl) {
            converted[i + idx].profilePicturePayload = dataUrl;
            console.log(
              '[Background] Converted image for:',
              profile.vanityName || profile.firstName
            );
          }
        }
      })
    );
  }

  return converted;
}

async function sendToBackend(profiles, sourceProfileUrl, sourceSection) {
  console.log('[Background] Sending to backend:', BACKEND_URL, 'section:', sourceSection);

  const headers = await getAuthHeaders();
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Not authenticated. Please login via the extension popup.');
  }

  // Convert profile pictures to data URLs before sending
  console.log('[Background] Converting profile images...');
  const profilesWithImages = await convertProfileImages(profiles);
  const convertedCount = profilesWithImages.filter((p) => p.profilePicturePayload).length;
  console.log('[Background] Converted', convertedCount, 'of', profiles.length, 'profile images');

  const response = await fetch(`${BACKEND_URL}/profiles`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profiles: profilesWithImages, sourceProfileUrl, sourceSection }),
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

// Resolve a member URN URL by opening a tab and watching for redirect
async function resolveMemberUrnUrl(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Timeout after 5 seconds
      cleanup();
      resolve(null);
    }, 5000);

    let tabId = null;

    const cleanup = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (tabId) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;

      // Check if URL changed to a real vanity name
      if (changeInfo.url) {
        const match = changeInfo.url.match(/linkedin\.com\/in\/([^\/\?]+)/);
        if (match && match[1] && !match[1].startsWith('ACo')) {
          console.log('[Background] Resolved:', url, '->', match[1]);
          cleanup();
          resolve(match[1]);
          return;
        }
      }

      // Also check when page finishes loading
      if (changeInfo.status === 'complete' && tab.url) {
        const match = tab.url.match(/linkedin\.com\/in\/([^\/\?]+)/);
        if (match && match[1] && !match[1].startsWith('ACo')) {
          console.log('[Background] Resolved on complete:', url, '->', match[1]);
          cleanup();
          resolve(match[1]);
          return;
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Create tab in background (not active)
    chrome.tabs.create({ url, active: false }, (tab) => {
      tabId = tab.id;
    });
  });
}

// Resolve multiple member URN profiles
async function resolveProfiles(profiles) {
  const resolved = [...profiles];
  const BATCH_SIZE = 3;

  const toResolve = profiles
    .map((p, idx) => ({ idx, profile: p }))
    .filter(({ profile }) => profile.vanityName && profile.vanityName.startsWith('ACo'));

  console.log('[Background] Resolving', toResolve.length, 'member URN profiles...');

  for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
    const batch = toResolve.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ idx, profile }) => {
        const vanityName = await resolveMemberUrnUrl(profile.profileUrl);
        if (vanityName) {
          resolved[idx] = {
            ...profile,
            vanityName,
            profileUrl: `https://www.linkedin.com/in/${vanityName}`,
            raw: { ...profile.raw, originalVanity: profile.vanityName, resolvedVanity: vanityName },
          };
        }
      })
    );

    // Small delay between batches
    if (i + BATCH_SIZE < toResolve.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const resolvedCount = resolved.filter((p, i) => profiles[i].vanityName !== p.vanityName).length;
  console.log('[Background] Resolved', resolvedCount, '/', toResolve.length, 'profiles');

  return resolved;
}

// Reset counter on extension load
chrome.storage.local.set({ totalCaptured: 0, lastUpdate: Date.now() });

console.log('[Background] Service worker started');
