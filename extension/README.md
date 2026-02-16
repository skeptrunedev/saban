# Saban - LinkedIn Profile Scraper Extension

Chrome extension that captures LinkedIn profile data as you browse.

## How It Works

The extension intercepts LinkedIn's Voyager API requests and extracts profile data, then sends it to the backend for storage.

## Capture Sources

| Source Section | Trigger | API Pattern | What It Captures |
|----------------|---------|-------------|------------------|
| `pymkRecommendedEntitySection` | Viewing "People you may know" | `pymkRecommendedEntitySection` | Recommended connections |
| `browsemapRecommendedEntitySection` | Viewing "More profiles for you" | `browsemapRecommendedEntitySection` | Similar profile suggestions |
| `directProfileView` | Visiting someone's profile page | `voyagerIdentityDashProfileComponents` | The profile you're viewing |
| `feedPostAuthors` | Scrolling the home feed | `voyagerFeedDashMainFeed` | Authors of posts in your feed |
| `postReactions` | Viewing who liked/reacted to a post | `voyagerSocialDashReactions` | People who reacted to a post |

## Data Captured

For each profile, we attempt to capture:

| Field | Description | Available In |
|-------|-------------|--------------|
| `firstName` | First name | All sources |
| `lastName` | Last name | All sources |
| `vanityName` | LinkedIn URL slug (e.g., `john-doe-123`) | All sources |
| `profileUrl` | Full LinkedIn profile URL | All sources |
| `memberUrn` | LinkedIn member URN identifier | Most sources |
| `headline` | Job title / tagline | Direct profile view, Reactions |
| `profilePictureUrl` | Profile photo URL | Direct profile view, Reactions |
| `location` | Geographic location | Direct profile view |
| `connectionDegree` | 1st, 2nd, 3rd connection | Direct profile view |

## Architecture

```
LinkedIn Page
     │
     ├─► content.js (MAIN world)
     │   └─► Intercepts fetch() and XMLHttpRequest
     │   └─► Extracts profile data from API responses
     │   └─► Posts message to isolated content script
     │
     ├─► content-isolated.js (ISOLATED world)
     │   └─► Receives profiles from MAIN world
     │   └─► Forwards to background script via chrome.runtime.sendMessage
     │
     └─► background.js (Service Worker)
         └─► Receives profiles
         └─► Sends to backend API with auth token
         └─► POST /profiles { profiles, sourceProfileUrl, sourceSection }
```

## Extraction Functions

### `extractProfiles(text)`
Used for PYMK and similar profile recommendations. Looks for patterns like:
```
"firstName":"John","lastName":"Doe"..."profileCanonicalUrl":"https://www.linkedin.com/in/john-doe"
```

### `extractFeedProfiles(text)`
Used for feed post authors. Looks for:
```
"firstName":"John"..."publicIdentifier":"john-doe"
```

### `extractViewedProfile(text)`
Used for direct profile views. Extracts single profile with full details including headline, location, etc.

### `extractReactionProfiles(text)`
Used for post reactions. Parses JSON structure with `reactorLockup` containing:
- `title.text` - Full name
- `subtitle.text` - Headline/job title
- `navigationUrl` - Profile URL
- `image` - Profile picture

## Authentication

The extension authenticates via JWT token stored in `chrome.storage.local`. Users authenticate through the web app at `/extension-auth`, which sends the token to the extension.

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker, handles API calls
- `content.js` - Main world script, intercepts network requests
- `content-isolated.js` - Isolated world script, bridges to background
- `content-auth.js` - Handles auth token from web app
- `popup.html/js` - Extension popup UI

## Development

```bash
# Install dependencies
pnpm install

# Lint
pnpm lint

# Format
pnpm format
```

## Loading the Extension

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder
