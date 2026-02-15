// Content script - runs in MAIN world to intercept fetch
(function () {
  // Patterns to intercept for similar profiles
  const TARGET_PATTERNS = [
    'browsemapRecommendedEntitySection', // "More profiles for you"
    'pymkRecommendedEntitySection', // "People you may know"
  ];

  // Patterns for direct profile view API
  const PROFILE_VIEW_PATTERNS = [
    'voyagerIdentityDashProfileComponents',
    'voyagerFeedDashGlobalNavs',
  ];

  // Pattern for feed posts (captures post authors while scrolling)
  const FEED_PATTERN = 'voyagerFeedDashMainFeed';

  // Pattern for post reactions (captures people who liked/reacted to posts)
  const REACTIONS_PATTERN = 'voyagerSocialDashReactions';

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // Debug: log all graphql/voyager requests
    if (url.includes('graphql') || url.includes('voyager')) {
      console.log('[LinkedIn Scraper] FETCH detected:', url.substring(0, 120));
    }

    const matchedPattern = TARGET_PATTERNS.find((p) => url.includes(p));
    if (matchedPattern) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted ${matchedPattern}, length: ${text.length}`);

        const profiles = extractProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles`);
          // Send to isolated content script via postMessage
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: matchedPattern,
            },
            '*'
          );
        } else {
          console.log('[LinkedIn Scraper] No profiles extracted');
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error:', err);
      }
    }

    // Also intercept direct profile views
    const profileViewPattern = PROFILE_VIEW_PATTERNS.find((p) => url.includes(p));
    if (profileViewPattern) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted profile view, length: ${text.length}`);

        const profile = extractViewedProfile(text);

        if (profile) {
          console.log(
            `[LinkedIn Scraper] Captured viewed profile: ${profile.firstName} ${profile.lastName}`
          );
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: [profile],
              sourceProfileUrl: window.location.href,
              sourceSection: 'directProfileView',
            },
            '*'
          );
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
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: 'feedPostAuthors',
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error extracting feed profiles:', err);
      }
    }

    // Intercept post reactions to capture people who liked/reacted
    if (url.includes(REACTIONS_PATTERN)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted reactions, length: ${text.length}`);

        const profiles = extractReactionProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from reactions`);
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: 'postReactions',
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] Error extracting reaction profiles:', err);
      }
    }

    return response;
  };

  function extractProfiles(text) {
    const profiles = [];
    const seen = new Set();

    // First, try to match profiles with firstName/lastName
    const blockRegex =
      /"firstName":"([^"]+)","lastName":"([^"]+)"[\s\S]{1,500}?"profileCanonicalUrl":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const firstName = match[1];
      const lastName = match[2];
      const profileUrl = match[3];

      if (seen.has(profileUrl)) continue;
      seen.add(profileUrl);

      const vanityName = extractVanityName(profileUrl);
      const memberUrn = extractMemberUrn(text, match.index);

      // Get additional context around this match for extra fields
      const context = text.slice(Math.max(0, match.index - 500), match.index + 2000);

      // Extract headline
      const headlineMatch = context.match(/"headline":"([^"]+)"/) ||
                           context.match(/"tagline":"([^"]+)"/) ||
                           context.match(/"occupation":"([^"]+)"/);
      const headline = headlineMatch ? headlineMatch[1] : null;

      // Extract profile picture URL
      const pictureMatch = context.match(/"picture"[\s\S]{0,300}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/) ||
                          context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/) ||
                          context.match(/"image"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/);
      const profilePictureUrl = pictureMatch ? pictureMatch[1] : null;

      // Extract location
      const locationMatch = context.match(/"locationName":"([^"]+)"/) ||
                           context.match(/"geoLocationName":"([^"]+)"/);
      const location = locationMatch ? locationMatch[1] : null;

      // Extract connection degree
      const degreeMatch = context.match(/"distance":\{"value":"([^"]+)"\}/) ||
                         context.match(/"degree":(\d)/) ||
                         context.match(/"connectionDegree":"([^"]+)"/);
      const connectionDegree = degreeMatch ? degreeMatch[1] : null;

      profiles.push({
        firstName,
        lastName,
        vanityName,
        profileUrl,
        memberUrn,
        headline,
        profilePictureUrl,
        location,
        connectionDegree,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName, profileUrl, memberUrn, headline, profilePictureUrl, location, connectionDegree },
      });
      console.log(
        `[LinkedIn Scraper] Extracted (with name): ${firstName} ${lastName} - ${profileUrl}`
      );
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

      // Get additional context for extra fields
      const context = text.slice(Math.max(0, match.index - 500), match.index + 2000);

      const headlineMatch = context.match(/"headline":"([^"]+)"/) ||
                           context.match(/"occupation":"([^"]+)"/);
      const headline = headlineMatch ? headlineMatch[1] : null;

      const pictureMatch = context.match(/"picture"[\s\S]{0,300}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/) ||
                          context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/);
      const profilePictureUrl = pictureMatch ? pictureMatch[1] : null;

      const locationMatch = context.match(/"locationName":"([^"]+)"/) ||
                           context.match(/"geoLocationName":"([^"]+)"/);
      const location = locationMatch ? locationMatch[1] : null;

      const degreeMatch = context.match(/"distance":\{"value":"([^"]+)"\}/) ||
                         context.match(/"degree":(\d)/);
      const connectionDegree = degreeMatch ? degreeMatch[1] : null;

      profiles.push({
        firstName,
        lastName,
        vanityName,
        profileUrl,
        memberUrn,
        headline,
        profilePictureUrl,
        location,
        connectionDegree,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName, profileUrl, memberUrn, headline, profilePictureUrl, location, connectionDegree, nameFromSlug: true },
      });
      console.log(
        `[LinkedIn Scraper] Extracted (from URL): ${firstName} ${lastName} - ${profileUrl}`
      );
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

      // Expand context to capture more data
      const context = text.slice(Math.max(0, match.index - 200), match.index + 1500);

      // Try to find lastName nearby
      const lastNameMatch = context.match(/"lastName":"([^"]+)"/);
      const lastName = lastNameMatch ? lastNameMatch[1] : null;

      // Extract headline (often in description.text or headline fields)
      const headlineMatch = context.match(/"description":\{"text":"([^"]+)"\}/) ||
                           context.match(/"headline":"([^"]+)"/) ||
                           context.match(/"text":"([^"]{10,100})"[\s\S]{0,50}?"accessibilityText"/);
      const headline = headlineMatch ? headlineMatch[1] : null;

      // Extract profile picture URL (look for profile image artifacts)
      const pictureMatch = context.match(/"rootUrl":"(https:\/\/media\.licdn\.com\/dms\/image\/[^"]+)"[\s\S]{0,500}?"artifacts"/) ||
                          context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/);
      const profilePictureUrl = pictureMatch ? pictureMatch[1] : null;

      // Extract location
      const locationMatch = context.match(/"locationName":"([^"]+)"/) ||
                           context.match(/"geoLocationName":"([^"]+)"/);
      const location = locationMatch ? locationMatch[1] : null;

      // Extract connection degree
      const degreeMatch = context.match(/"distance":\{"value":"([^"]+)"\}/) ||
                         context.match(/"connectionDegree":"([^"]+)"/) ||
                         context.match(/"degree":(\d)/);
      const connectionDegree = degreeMatch ? degreeMatch[1] : null;

      const profileUrl = `https://www.linkedin.com/in/${publicId}`;

      profiles.push({
        firstName,
        lastName,
        vanityName: publicId,
        profileUrl,
        memberUrn: null,
        headline,
        profilePictureUrl,
        location,
        connectionDegree,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName: publicId, profileUrl, headline, profilePictureUrl, location, connectionDegree, fromFeed: true },
      });
    }

    return profiles;
  }

  function extractReactionProfiles(text) {
    const profiles = [];
    const seen = new Set();

    try {
      const data = JSON.parse(text);
      const included = data.included || [];

      for (const item of included) {
        if (!item.reactorLockup) continue;

        const lockup = item.reactorLockup;
        const actorUrn = item.actorUrn;

        // Get name from title.text
        const fullName = lockup.title?.text || '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || null;
        const lastName = nameParts.slice(1).join(' ') || null;

        // Get headline from subtitle.text
        const headline = lockup.subtitle?.text || null;

        // Get profile URL and extract vanity name
        const navigationUrl = lockup.navigationUrl || '';
        const vanityMatch = navigationUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
        const vanityName = vanityMatch ? vanityMatch[1] : null;
        const profileUrl = vanityName
          ? `https://www.linkedin.com/in/${vanityName}`
          : navigationUrl;

        // Extract member URN from actorUrn
        const memberUrnMatch = actorUrn?.match(/fsd_profile:([^,\)]+)/);
        const memberUrn = memberUrnMatch ? `urn:li:member:${memberUrnMatch[1]}` : null;

        // Get profile picture URL from image attributes
        let profilePictureUrl = null;
        const imageAttrs = lockup.image?.attributes || [];
        for (const attr of imageAttrs) {
          const vectorImage = attr.detailData?.nonEntityProfilePicture?.vectorImage;
          if (vectorImage?.rootUrl && vectorImage?.artifacts?.length > 0) {
            // Get the largest artifact
            const largestArtifact = vectorImage.artifacts.reduce((prev, curr) =>
              (curr.width > (prev?.width || 0)) ? curr : prev
            , null);
            if (largestArtifact) {
              profilePictureUrl = vectorImage.rootUrl + largestArtifact.fileIdentifyingUrlPathSegment;
            }
            break;
          }
        }

        // Skip if we've seen this profile or have no identifier
        const identifier = vanityName || memberUrn || profileUrl;
        if (!identifier || seen.has(identifier)) continue;
        seen.add(identifier);

        profiles.push({
          firstName,
          lastName,
          vanityName,
          profileUrl,
          memberUrn,
          headline,
          profilePictureUrl,
          location: null, // Not available in reactions
          connectionDegree: null, // Not available in reactions
          profilePicturePayload: null,
          raw: { firstName, lastName, vanityName, profileUrl, memberUrn, headline, profilePictureUrl, fromReaction: true },
        });
      }
    } catch (err) {
      console.error('[LinkedIn Scraper] Error parsing reaction JSON:', err);
      // Fallback to regex extraction if JSON parsing fails
      return extractReactionProfilesRegex(text);
    }

    return profiles;
  }

  function extractReactionProfilesRegex(text) {
    const profiles = [];
    const seen = new Set();

    // Match reactorLockup blocks with navigationUrl
    const navUrlRegex = /"navigationUrl":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"/g;

    let match;
    while ((match = navUrlRegex.exec(text)) !== null) {
      const profileUrl = match[1];
      const vanityMatch = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      const vanityName = vanityMatch ? vanityMatch[1] : null;

      if (!vanityName || seen.has(vanityName)) continue;
      seen.add(vanityName);

      // Find nearby title and subtitle
      const context = text.slice(Math.max(0, match.index - 1000), match.index + 500);

      const titleMatch = context.match(/"title":\{[^}]*"text":"([^"]+)"/);
      const subtitleMatch = context.match(/"subtitle":\{[^}]*"text":"([^"]+)"/);

      const fullName = titleMatch ? titleMatch[1] : '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;
      const headline = subtitleMatch ? subtitleMatch[1] : null;

      profiles.push({
        firstName,
        lastName,
        vanityName,
        profileUrl: `https://www.linkedin.com/in/${vanityName}`,
        memberUrn: null,
        headline,
        profilePictureUrl: null,
        location: null,
        connectionDegree: null,
        profilePicturePayload: null,
        raw: { firstName, lastName, vanityName, profileUrl, headline, fromReaction: true, regexFallback: true },
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
    const profileUrl = vanityName
      ? `https://www.linkedin.com/in/${vanityName}`
      : window.location.href.split('?')[0];
    const memberUrn = memberUrnMatch ? `urn:li:member:${memberUrnMatch[1]}` : null;

    // Extract headline
    const headlineMatch = text.match(/"headline":"([^"]+)"/) ||
                         text.match(/"tagline":"([^"]+)"/);
    const headline = headlineMatch ? headlineMatch[1] : null;

    // Extract profile picture URL (look for the highest quality image)
    const pictureMatch = text.match(/"displayImageReference"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/) ||
                        text.match(/"profilePicture"[\s\S]{0,500}?"artifacts"[\s\S]{0,200}?"fileIdentifyingUrlPathSegment":"([^"]+)"/) ||
                        text.match(/"picture"[\s\S]{0,300}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/);
    const profilePictureUrl = pictureMatch ? pictureMatch[1] : null;

    // Extract location
    const locationMatch = text.match(/"geoLocationName":"([^"]+)"/) ||
                         text.match(/"locationName":"([^"]+)"/) ||
                         text.match(/"geoLocation"[\s\S]{0,100}?"name":"([^"]+)"/);
    const location = locationMatch ? locationMatch[1] : null;

    // Extract connection degree
    const degreeMatch = text.match(/"distance":\{"value":"([^"]+)"\}/) ||
                       text.match(/"degree":"([^"]+)"/) ||
                       text.match(/"connectionDegree":"([^"]+)"/);
    const connectionDegree = degreeMatch ? degreeMatch[1] : null;

    return {
      firstName,
      lastName,
      vanityName,
      profileUrl,
      memberUrn,
      headline,
      profilePictureUrl,
      location,
      connectionDegree,
      profilePicturePayload: null,
      raw: { firstName, lastName, vanityName, profileUrl, memberUrn, headline, profilePictureUrl, location, connectionDegree, directView: true },
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
    const parts = cleanSlug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  // Also intercept XMLHttpRequest for APIs that don't use fetch
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  // Helper to get response text from XHR (handles blob responseType)
  async function getXHRResponseText(xhr) {
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      return xhr.responseText;
    } else if (xhr.responseType === 'blob' && xhr.response instanceof Blob) {
      return await xhr.response.text();
    } else if (xhr.responseType === 'arraybuffer' && xhr.response instanceof ArrayBuffer) {
      return new TextDecoder().decode(xhr.response);
    } else if (xhr.responseType === 'json') {
      return JSON.stringify(xhr.response);
    }
    return null;
  }

  // Process XHR response for feed/profile data
  async function processXHRResponse(xhr, url) {
    // Check for feed pattern
    if (url.includes(FEED_PATTERN)) {
      console.log(
        '[LinkedIn Scraper] XHR feed pattern matched! responseType:',
        xhr.responseType,
        'status:',
        xhr.status
      );
      try {
        const responseText = await getXHRResponseText(xhr);
        if (!responseText) {
          console.error('[LinkedIn Scraper] Could not get response text');
          return;
        }
        console.log(`[LinkedIn Scraper] XHR Intercepted feed, length: ${responseText.length}`);
        const profiles = extractFeedProfiles(responseText);
        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from feed (XHR)`);
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: 'feedPostAuthors',
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] XHR feed error:', err);
      }
    }

    // Check for profile view patterns
    const profileViewPattern = PROFILE_VIEW_PATTERNS.find((p) => url.includes(p));
    if (profileViewPattern) {
      console.log(
        '[LinkedIn Scraper] XHR profile view matched! responseType:',
        xhr.responseType,
        'status:',
        xhr.status
      );
      try {
        const responseText = await getXHRResponseText(xhr);
        if (!responseText) return;
        console.log(
          `[LinkedIn Scraper] XHR Intercepted profile view, length: ${responseText.length}`
        );
        const profile = extractViewedProfile(responseText);
        if (profile) {
          console.log(
            `[LinkedIn Scraper] Captured viewed profile (XHR): ${profile.firstName} ${profile.lastName}`
          );
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: [profile],
              sourceProfileUrl: window.location.href,
              sourceSection: 'directProfileView',
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] XHR profile view error:', err);
      }
    }

    // Check for similar profiles patterns
    const matchedPattern = TARGET_PATTERNS.find((p) => url.includes(p));
    if (matchedPattern) {
      try {
        const responseText = await getXHRResponseText(xhr);
        if (!responseText) return;
        console.log(
          `[LinkedIn Scraper] XHR Intercepted ${matchedPattern}, length: ${responseText.length}`
        );
        const profiles = extractProfiles(responseText);
        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles (XHR)`);
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: matchedPattern,
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] XHR error:', err);
      }
    }

    // Check for post reactions pattern
    if (url.includes(REACTIONS_PATTERN)) {
      console.log(
        '[LinkedIn Scraper] XHR reactions pattern matched! responseType:',
        xhr.responseType,
        'status:',
        xhr.status
      );
      try {
        const responseText = await getXHRResponseText(xhr);
        if (!responseText) {
          console.error('[LinkedIn Scraper] Could not get reactions response text');
          return;
        }
        console.log(`[LinkedIn Scraper] XHR Intercepted reactions, length: ${responseText.length}`);
        const profiles = extractReactionProfiles(responseText);
        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from reactions (XHR)`);
          window.postMessage(
            {
              type: 'LINKEDIN_SCRAPER_PROFILES',
              profiles: profiles,
              sourceProfileUrl: window.location.href,
              sourceSection: 'postReactions',
            },
            '*'
          );
        }
      } catch (err) {
        console.error('[LinkedIn Scraper] XHR reactions error:', err);
      }
    }
  }

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = this._url || '';

      // Debug: log all graphql/voyager XHR requests
      if (url.includes('graphql') || url.includes('voyager')) {
        console.log('[LinkedIn Scraper] XHR detected:', url.substring(0, 120));
      }

      // Process the response asynchronously to handle blob responses
      processXHRResponse(this, url);
    });

    return originalXHRSend.apply(this, args);
  };

  console.log('[LinkedIn Scraper] Content script (MAIN) loaded');
})();
