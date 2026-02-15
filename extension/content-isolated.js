// Content script - runs in ISOLATED world to bridge to background script
(function () {
  // Listen for messages from the MAIN world content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type !== 'LINKEDIN_SCRAPER_PROFILES') return;

    console.log('[LinkedIn Scraper] Isolated script received profiles:', event.data.profiles.length);

    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'profiles_captured',
      profiles: event.data.profiles,
      sourceProfileUrl: event.data.sourceProfileUrl,
      sourceSection: event.data.sourceSection
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[LinkedIn Scraper] Error sending to background:', chrome.runtime.lastError);
      } else {
        console.log('[LinkedIn Scraper] Background response:', response);
      }
    });
  });

  console.log('[LinkedIn Scraper] Content script (ISOLATED) loaded');
})();
