// Content script for the web app auth page
// Listens for auth token data and sends it to the background script

console.log('[Extension Auth] Content script loaded on:', window.location.href);

// Listen for messages from the web app
window.addEventListener('message', (event) => {
  // Only accept messages from our web app
  const allowedOrigins = ['http://localhost:5173', 'https://saban.skeptrune.com'];
  if (!allowedOrigins.includes(event.origin)) return;

  if (event.data?.type === 'EXTENSION_AUTH_TOKEN') {
    console.log('[Extension Auth] Received auth token from web app');

    // Send to background script
    chrome.runtime.sendMessage(
      {
        type: 'save_auth',
        token: event.data.token,
        user: event.data.user,
        organization: event.data.organization,
      },
      (response) => {
        if (response?.success) {
          console.log('[Extension Auth] Token saved successfully');
          // Notify the web app that we received it
          window.postMessage({ type: 'EXTENSION_AUTH_SUCCESS' }, '*');
        } else {
          console.error('[Extension Auth] Failed to save token');
          window.postMessage({ type: 'EXTENSION_AUTH_ERROR', error: 'Failed to save token' }, '*');
        }
      }
    );
  }
});

// Let the web app know the extension is installed
window.postMessage({ type: 'EXTENSION_INSTALLED' }, '*');
