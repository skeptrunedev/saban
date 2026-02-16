// Content script - runs in MAIN world to intercept fetch
(function () {
  // Patterns to intercept for similar profiles
  const TARGET_PATTERNS = [
    'browsemapRecommendedEntitySection', // "More profiles for you"
    'pymkRecommendedEntitySection', // "People you may know"
  ];

  // Pattern for feed posts (captures post authors while scrolling)
  const FEED_PATTERN = 'voyagerFeedDashMainFeed';

  // Pattern for post reactions (captures people who liked/reacted to posts)
  const REACTIONS_PATTERN = 'voyagerSocialDashReactions';

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    const matchedPattern = TARGET_PATTERNS.find((p) => url.includes(p));
    if (matchedPattern) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted ${matchedPattern}, length: ${text.length}`);

        // DEBUG: Log what fields exist in response
        console.log('[LinkedIn Scraper] DEBUG PYMK/BROWSEMAP fields:', {
          hasOccupation: text.includes('"occupation"'),
          hasHeadline: text.includes('"headline"'),
          hasTagline: text.includes('"tagline"'),
          hasLocationName: text.includes('"locationName"'),
          hasGeoLocationName: text.includes('"geoLocationName"'),
          hasDistance: text.includes('"distance"'),
          hasConnectionDegree: text.includes('"connectionDegree"'),
          hasPicture: text.includes('"picture"'),
          hasProfilePicture: text.includes('"profilePicture"'),
          hasRootUrl: text.includes('"rootUrl"'),
          hasImage: text.includes('"image"'),
        });

        // Find a sample profile block to see structure
        const sampleMatch = text.match(/"firstName":"([^"]+)","lastName":"([^"]+)"[\s\S]{0,2000}/);
        if (sampleMatch) {
          console.log(
            '[LinkedIn Scraper] DEBUG - Sample profile block (first match):',
            sampleMatch[0].substring(0, 1500)
          );
        }

        const profiles = extractProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles`);
          // DEBUG: Log first profile's extracted data
          console.log(
            '[LinkedIn Scraper] DEBUG - First profile extracted:',
            JSON.stringify(profiles[0], null, 2)
          );
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

    // Intercept feed to capture post authors while scrolling
    if (url.includes(FEED_PATTERN)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[LinkedIn Scraper] Intercepted feed, length: ${text.length}`);

        // DEBUG: Log what fields exist in feed response
        console.log('[LinkedIn Scraper] DEBUG FEED fields:', {
          hasOccupation: text.includes('"occupation"'),
          hasHeadline: text.includes('"headline"'),
          hasDescription: text.includes('"description"'),
          hasTagline: text.includes('"tagline"'),
          hasLocationName: text.includes('"locationName"'),
          hasGeoLocationName: text.includes('"geoLocationName"'),
          hasDistance: text.includes('"distance"'),
          hasPicture: text.includes('"picture"'),
          hasProfilePicture: text.includes('"profilePicture"'),
          hasRootUrl: text.includes('"rootUrl"'),
        });

        // Find a sample author block to see structure
        const sampleMatch = text.match(
          /"firstName":"([^"]+)"[\s\S]{0,300}?"publicIdentifier":"([^"]+)"[\s\S]{0,1500}/
        );
        if (sampleMatch) {
          console.log(
            '[LinkedIn Scraper] DEBUG FEED - Sample author block:',
            sampleMatch[0].substring(0, 1200)
          );
        }

        const profiles = extractFeedProfiles(text);

        if (profiles.length > 0) {
          console.log(`[LinkedIn Scraper] Found ${profiles.length} profiles from feed`);
          console.log(
            '[LinkedIn Scraper] DEBUG FEED - First profile:',
            JSON.stringify(profiles[0], null, 2)
          );
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
          // Member URN resolution happens in background.js via tab navigation
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

  // Build a map of publicIdentifier/vanityName -> profile data from entire response
  function buildProfileDataMap(text) {
    const map = {};

    // Find all fsd_profile or profile entities with occupation/headline
    // Pattern: publicIdentifier near occupation
    const profileBlocks = text.matchAll(
      /"publicIdentifier":"([^"]+)"[^}]{0,800}?"occupation":"([^"]+)"/g
    );
    for (const match of profileBlocks) {
      const publicId = match[1];
      const occupation = match[2];
      if (!map[publicId]) map[publicId] = {};
      map[publicId].headline = occupation;
    }

    // Also try reverse order (occupation before publicIdentifier)
    const reverseBlocks = text.matchAll(
      /"occupation":"([^"]+)"[^}]{0,800}?"publicIdentifier":"([^"]+)"/g
    );
    for (const match of reverseBlocks) {
      const occupation = match[1];
      const publicId = match[2];
      if (!map[publicId]) map[publicId] = {};
      map[publicId].headline = occupation;
    }

    // Find headline field
    const headlineBlocks = text.matchAll(
      /"publicIdentifier":"([^"]+)"[^}]{0,500}?"headline":"([^"]+)"/g
    );
    for (const match of headlineBlocks) {
      const publicId = match[1];
      const headline = match[2];
      if (!map[publicId]) map[publicId] = {};
      if (!map[publicId].headline) map[publicId].headline = headline;
    }

    // Find geoLocationName
    const locationBlocks = text.matchAll(
      /"publicIdentifier":"([^"]+)"[^}]{0,500}?"geoLocationName":"([^"]+)"/g
    );
    for (const match of locationBlocks) {
      const publicId = match[1];
      const location = match[2];
      if (!map[publicId]) map[publicId] = {};
      map[publicId].location = location;
    }

    // Find profile picture rootUrl near publicIdentifier
    const pictureBlocks = text.matchAll(
      /"publicIdentifier":"([^"]+)"[^}]{0,1000}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/g
    );
    for (const match of pictureBlocks) {
      const publicId = match[1];
      const pictureUrl = match[2];
      if (!map[publicId]) map[publicId] = {};
      map[publicId].profilePictureUrl = pictureUrl;
    }

    console.log(
      '[LinkedIn Scraper] Built profile data map with',
      Object.keys(map).length,
      'entries'
    );
    return map;
  }

  function extractProfiles(text) {
    const profiles = [];
    const seen = new Set();

    // Build a map of publicIdentifier -> profile data from the entire response
    const profileDataMap = buildProfileDataMap(text);

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

      // Look up additional data from the map
      const extraData = profileDataMap[vanityName] || {};

      // Get additional context around this match for extra fields (fallback)
      const context = text.slice(Math.max(0, match.index - 500), match.index + 2000);

      // Extract headline - prefer map data, then context
      const headline =
        extraData.headline ||
        (context.match(/"headline":"([^"]+)"/) ||
          context.match(/"tagline":"([^"]+)"/) ||
          context.match(/"occupation":"([^"]+)"/))?.[1] ||
        null;

      // Extract profile picture URL - try payload first (PYMK/browsemap), then standard patterns
      const payloadMatch = context.match(/"profilePictureRenderPayload":"([^"]+)"/);
      const pictureFromPayload = payloadMatch ? extractPictureFromPayload(payloadMatch[1]) : null;

      const profilePictureUrl =
        pictureFromPayload ||
        extraData.profilePictureUrl ||
        (context.match(/"picture"[\s\S]{0,300}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/) ||
          context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/) ||
          context.match(/"image"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/))?.[1] ||
        null;

      // Extract location
      const location =
        extraData.location ||
        (context.match(/"locationName":"([^"]+)"/) ||
          context.match(/"geoLocationName":"([^"]+)"/))?.[1] ||
        null;

      // Extract connection degree
      const connectionDegree =
        extraData.connectionDegree ||
        (context.match(/"distance":\{"value":"([^"]+)"\}/) ||
          context.match(/"degree":(\d)/) ||
          context.match(/"connectionDegree":"([^"]+)"/))?.[1] ||
        null;

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
        raw: {
          firstName,
          lastName,
          vanityName,
          profileUrl,
          memberUrn,
          headline,
          profilePictureUrl,
          location,
          connectionDegree,
        },
      });
      console.log(
        `[LinkedIn Scraper] Extracted (with name): ${firstName} ${lastName} - ${profileUrl} - headline: ${headline}`
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

      const headlineMatch =
        context.match(/"headline":"([^"]+)"/) || context.match(/"occupation":"([^"]+)"/);
      const headline = headlineMatch ? headlineMatch[1] : null;

      // Try payload first, then standard patterns
      const payloadMatch2 = context.match(/"profilePictureRenderPayload":"([^"]+)"/);
      const pictureFromPayload2 = payloadMatch2
        ? extractPictureFromPayload(payloadMatch2[1])
        : null;
      const pictureMatch =
        context.match(/"picture"[\s\S]{0,300}?"rootUrl":"(https:\/\/media\.licdn\.com\/[^"]+)"/) ||
        context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/);
      const profilePictureUrl = pictureFromPayload2 || (pictureMatch ? pictureMatch[1] : null);

      const locationMatch =
        context.match(/"locationName":"([^"]+)"/) || context.match(/"geoLocationName":"([^"]+)"/);
      const location = locationMatch ? locationMatch[1] : null;

      const degreeMatch =
        context.match(/"distance":\{"value":"([^"]+)"\}/) || context.match(/"degree":(\d)/);
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
        raw: {
          firstName,
          lastName,
          vanityName,
          profileUrl,
          memberUrn,
          headline,
          profilePictureUrl,
          location,
          connectionDegree,
          nameFromSlug: true,
        },
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
      const headlineMatch =
        context.match(/"description":\{"text":"([^"]+)"\}/) ||
        context.match(/"headline":"([^"]+)"/) ||
        context.match(/"text":"([^"]{10,100})"[\s\S]{0,50}?"accessibilityText"/);
      const headline = headlineMatch ? headlineMatch[1] : null;

      // Extract profile picture URL (look for profile image artifacts)
      const pictureMatch =
        context.match(
          /"rootUrl":"(https:\/\/media\.licdn\.com\/dms\/image\/[^"]+)"[\s\S]{0,500}?"artifacts"/
        ) || context.match(/"profilePicture"[\s\S]{0,200}?"url":"(https:\/\/[^"]+)"/);
      const profilePictureUrl = pictureMatch ? pictureMatch[1] : null;

      // Extract location
      const locationMatch =
        context.match(/"locationName":"([^"]+)"/) || context.match(/"geoLocationName":"([^"]+)"/);
      const location = locationMatch ? locationMatch[1] : null;

      // Extract connection degree
      const degreeMatch =
        context.match(/"distance":\{"value":"([^"]+)"\}/) ||
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
        raw: {
          firstName,
          lastName,
          vanityName: publicId,
          profileUrl,
          headline,
          profilePictureUrl,
          location,
          connectionDegree,
          fromFeed: true,
        },
      });
    }

    return profiles;
  }

  // Check if a vanity name is actually a member URN (starts with ACo)
  function isMemberUrn(vanityName) {
    return vanityName && vanityName.startsWith('ACo');
  }

  function extractReactionProfiles(text) {
    const profiles = [];
    const seen = new Set();

    try {
      const data = JSON.parse(text);
      const included = data.included || [];

      // Build a map of member URN -> publicIdentifier from included items
      const urnToPublicId = {};
      for (const item of included) {
        // Look for profile entities that have both entityUrn and publicIdentifier
        if (item.publicIdentifier && item.entityUrn) {
          const urnMatch = item.entityUrn.match(/fsd_profile:([^,\)]+)/);
          if (urnMatch) {
            urnToPublicId[urnMatch[1]] = item.publicIdentifier;
          }
        }
        // Also check for miniProfile patterns
        if (item.publicIdentifier && item['$type']?.includes('MiniProfile')) {
          const urnMatch = item.entityUrn?.match(/fs_miniProfile:([^,\)]+)/);
          if (urnMatch) {
            urnToPublicId[urnMatch[1]] = item.publicIdentifier;
          }
        }
      }
      console.log(
        '[LinkedIn Scraper] Built URN->publicId map:',
        Object.keys(urnToPublicId).length,
        'entries'
      );

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
        let vanityName = vanityMatch ? vanityMatch[1] : null;

        // If vanity name is a member URN, try to look it up in our map
        if (isMemberUrn(vanityName)) {
          const memberUrn = vanityName;
          const publicId = urnToPublicId[memberUrn];
          if (publicId) {
            console.log(`[LinkedIn Scraper] Found publicId in data: ${memberUrn} -> ${publicId}`);
            vanityName = publicId;
          }
        }

        const profileUrl = vanityName ? `https://www.linkedin.com/in/${vanityName}` : navigationUrl;

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
            const largestArtifact = vectorImage.artifacts.reduce(
              (prev, curr) => (curr.width > (prev?.width || 0) ? curr : prev),
              null
            );
            if (largestArtifact) {
              profilePictureUrl =
                vectorImage.rootUrl + largestArtifact.fileIdentifyingUrlPathSegment;
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
          raw: {
            firstName,
            lastName,
            vanityName,
            profileUrl,
            memberUrn,
            headline,
            profilePictureUrl,
            fromReaction: true,
          },
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
        raw: {
          firstName,
          lastName,
          vanityName,
          profileUrl,
          headline,
          fromReaction: true,
          regexFallback: true,
        },
      });
    }

    return profiles;
  }

  // Decode profile picture from base64 payload used in PYMK/browsemap
  function extractPictureFromPayload(payload) {
    if (!payload) return null;
    try {
      // The payload is base64 encoded and contains embedded URLs
      const decoded = atob(payload);
      // Look for LinkedIn CDN URL pattern in the decoded content
      const urlMatch = decoded.match(/https:\/\/media\.licdn\.com\/dms\/image\/[^\s"',]+/);
      if (urlMatch) {
        // Clean up the URL - remove any trailing binary garbage
        let url = urlMatch[0];
        // Find where the valid URL ends (before any control characters)
        const invalidCharIndex = url.search(/[\x00-\x1f]/);
        if (invalidCharIndex > 0) {
          url = url.substring(0, invalidCharIndex);
        }
        return url;
      }
    } catch (e) {
      console.log('[LinkedIn Scraper] Failed to decode picture payload:', e);
    }
    return null;
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
      try {
        const responseText = await getXHRResponseText(xhr);
        if (!responseText) return;
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
          // Member URN resolution happens in background.js via tab navigation
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
      // Process the response asynchronously to handle blob responses
      processXHRResponse(this, url);
    });

    return originalXHRSend.apply(this, args);
  };

  console.log('[LinkedIn Scraper] Content script (MAIN) loaded');
})();
