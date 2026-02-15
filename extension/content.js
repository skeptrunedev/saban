// Content script - runs in MAIN world to intercept fetch
(function () {
  // Patterns to intercept for similar profiles
  const TARGET_PATTERNS = [
    'browsemapRecommendedEntitySection',  // "More profiles for you"
    'pymkRecommendedEntitySection'         // "People you may know"
  ];

  // Patterns for direct profile view API
  const PROFILE_VIEW_PATTERNS = [
    'voyagerIdentityDashProfileComponents',
    'voyagerFeedDashGlobalNavs'
  ];

  // Pattern for feed posts (captures post authors while scrolling)
  const FEED_PATTERN = 'voyagerFeedDashMainFeed';

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    const matchedPattern = TARGET_PATTERNS.find(p => url.includes(p));
    if (matchedPattern) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted ${matchedPattern}, length: ${text.length}`);

        const profiles = extractProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles`);
          // Send to isolated content script via postMessage
          window.postMessage({
            type: 'LINKEDIN_SCRAPER_PROFILES',
            profiles: profiles,
            sourceProfileUrl: window.location.href,
            sourceSection: matchedPattern
          }, '*');
        } else {
          console.log('[LinkedIn Scraper] No profiles extracted');
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error:', err);
      }
    }

    // Also intercept direct profile views
    const profileViewPattern = PROFILE_VIEW_PATTERNS.find(p => url.includes(p));
    if (profileViewPattern) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted profile view, length: ${text.length}`);

        const profile = extractViewedProfile(text);

        if (profile) {
          console.log(`[LinkedIn Scraper] Captured viewed profile: ${profile.firstName} ${profile.lastName}`);
          window.postMessage({
            type: 'LINKEDIN_SCRAPER_PROFILES',
            profiles: [profile],
            sourceProfileUrl: window.location.href,
            sourceSection: 'directProfileView'
          }, '*');
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error extracting viewed profile:', err);
      }
    }

    // Intercept feed to capture post authors while scrolling
    if (url.includes(FEED_PATTERN)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted feed, length: ${text.length}`);

        const profiles = extractFeedProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from feed`);
          window.postMessage({
            type: 'LINKEDIN_SCRAPER_PROFILES',
            profiles: profiles,
            sourceProfileUrl: window.location.href,
            sourceSection: 'feedPostAuthors'
          }, '*');
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error extracting feed profiles:', err);
      }
    }

    return response;
  };

  function extractProfiles(text) {
    const profiles = [];
    const seen = new Set();

    // First, try to match profiles with firstName/lastName
    const blockRegex = /"firstName":"([^"]+)","lastName":"([^"]+)"[\s\S]{1,500}?"profileCanonicalUrl":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const firstName = match[1];
      const lastName = match[2];
      const profileUrl = match[3];

      if (seen.has(profileUrl)) continue;
      seen.add(profileUrl);

      const vanityName = extractVanityName(profileUrl);
      const memberUrn = extractMemberUrn(text, match.index);

      profiles.push({
        firstName,
        lastName,
        vanityName,
        profileUrl,
        memberUrn,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName, profileUrl, memberUrn },
      });
      console.log(`[LinkedIn Scraper] Extracted (with name): ${firstName} ${lastName} - ${profileUrl}`);
    }

    // Second, find all profile URLs and add ones we haven't seen
    const urlRegex = /"url":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"/g;

    while ((match = urlRegex.exec(text)) !== null) {
      const profileUrl = match[1].replace(/\/$/, '');

      if (seen.has(profileUrl) || seen.has(profileUrl + '/')) continue;
      seen.add(profileUrl);

      const vanityName = extractVanityName(profileUrl);
      const { firstName, lastName } = parseNameFromSlug(vanityName);
      const memberUrn = extractMemberUrn(text, match.index);

      profiles.push({
        firstName,
        lastName,
        vanityName,
        profileUrl,
        memberUrn,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName, profileUrl, memberUrn, nameFromSlug: true },
      });
      console.log(`[LinkedIn Scraper] Extracted (from URL): ${firstName} ${lastName} - ${profileUrl}`);
    }

    console.log(`[LinkedIn Scraper] Total unique profiles: ${profiles.length}`);
    return profiles;
  }

  function extractFeedProfiles(text) {
    const profiles = [];
    const seen = new Set();

    // Extract profiles from feed - pattern: "firstName":"Name"..."publicIdentifier":"slug"
    const regex = /"firstName":"([^"]+)"[\s\S]{0,300}?"publicIdentifier":"([^"]+)"/g;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const firstName = match[1];
      const publicId = match[2];

      if (seen.has(publicId)) continue;
      seen.add(publicId);

      // Try to find lastName nearby
      const context = text.slice(Math.max(0, match.index - 100), match.index + 500);
      const lastNameMatch = context.match(/"lastName":"([^"]+)"/);
      const lastName = lastNameMatch ? lastNameMatch[1] : null;

      const profileUrl = `https://www.linkedin.com/in/${publicId}`;

      profiles.push({
        firstName,
        lastName,
        vanityName: publicId,
        profileUrl,
        memberUrn: null,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName: publicId, profileUrl, fromFeed: true },
      });
    }

    return profiles;
  }

  function extractViewedProfile(text) {
    // Extract the profile being directly viewed
    // Look for the main profile data with firstName, lastName, and publicIdentifier

    // Pattern for profile data in the response
    const firstNameMatch = text.match(/"firstName":"([^"]+)"/);
    const lastNameMatch = text.match(/"lastName":"([^"]+)"/);
    const publicIdMatch = text.match(/"publicIdentifier":"([^"]+)"/);
    const memberUrnMatch = text.match(/"entityUrn":"urn:li:fsd_profile:([^"]+)"/);

    if (!firstNameMatch || !lastNameMatch) {
      return null;
    }

    const firstName = firstNameMatch[1];
    const lastName = lastNameMatch[1];
    const vanityName = publicIdMatch ? publicIdMatch[1] : null;
    const profileUrl = vanityName ? `https://www.linkedin.com/in/${vanityName}` : window.location.href.split('?')[0];
    const memberUrn = memberUrnMatch ? `urn:li:member:${memberUrnMatch[1]}` : null;

    return {
      firstName,
      lastName,
      vanityName,
      profileUrl,
      memberUrn,
      profilePicturePayload: null,
      raw: { firstName, lastName, vanityName, profileUrl, memberUrn, directView: true },
    };
  }

  function extractVanityName(profileUrl) {
    const match = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  function extractMemberUrn(text, startIdx) {
    const searchStart = Math.max(0, startIdx - 1500);
    const searchEnd = Math.min(text.length, startIdx + 500);
    const context = text.slice(searchStart, searchEnd);

    const urnMatch = context.match(/urn:li:member:(\d+)/);
    return urnMatch ? `urn:li:member:${urnMatch[1]}` : null;
  }

  function parseNameFromSlug(slug) {
    if (!slug) return { firstName: null, lastName: null };

    const cleanSlug = slug.replace(/-\d+$/, '');
    const parts = cleanSlug.split('-').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    );

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  // Also intercept XMLHttpRequest for APIs that don't use fetch
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      const url = this._url || '';

      // Check for feed pattern
      if (url.includes(FEED_PATTERN)) {
        try {
          console.log(`[LinkedIn Scraper] XHR Intercepted feed, length: ${this.responseText.length}`);
          const profiles = extractFeedProfiles(this.responseText);
          if (profiles.length > 0) {
            console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from feed (XHR)`);
            window.postMessage({
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: 'feedPostAuthors'
            }, '*');
          }
        } catch (err) {
          console.error('[LinkedIn Scraper] XHR feed error:', err);
        }
      }

      // Check for profile view patterns
      const profileViewPattern = PROFILE_VIEW_PATTERNS.find(p => url.includes(p));
      if (profileViewPattern) {
        try {
          console.log(`[LinkedIn Scraper] XHR Intercepted profile view, length: ${this.responseText.length}`);
          const profile = extractViewedProfile(this.responseText);
          if (profile) {
            console.log(`[LinkedIn Scraper] Captured viewed profile (XHR): ${profile.firstName} ${profile.lastName}`);
            window.postMessage({
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: [profile],
              sourceProfileUrl: window.location.href,
              sourceSection: 'directProfileView'
            }, '*');
          }
        } catch (err) {
          console.error('[LinkedIn Scraper] XHR profile view error:', err);
        }
      }

      // Check for similar profiles patterns
      const matchedPattern = TARGET_PATTERNS.find(p => url.includes(p));
      if (matchedPattern) {
        try {
          console.log(`[LinkedIn Scraper] XHR Intercepted ${matchedPattern}, length: ${this.responseText.length}`);
          const profiles = extractProfiles(this.responseText);
          if (profiles.length > 0) {
            console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles (XHR)`);
            window.postMessage({
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: matchedPattern
            }, '*');
          }
        } catch (err) {
          console.error('[LinkedIn Scraper] XHR error:', err);
        }
      }
    });

    return originalXHRSend.apply(this, args);
  };

  console.log('[LinkedIn Scraper] Content script (MAIN) loaded');
})();
