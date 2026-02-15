const BACKEND_URL = 'http://localhost:3847';
const WEB_APP_URL = 'http://localhost:5173';

// DOM elements
const authLoggedOut = document.getElementById('auth-logged-out');
const authLoggedIn = document.getElementById('auth-logged-in');
const userEmailEl = document.getElementById('user-email');
const orgNameEl = document.getElementById('org-name');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const totalEl = document.getElementById('total');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const tokenPasteSection = document.getElementById('token-paste-section');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('save-token-btn');

// Check auth status and update UI
async function checkAuthStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get_auth_status' }, (response) => {
      if (response && response.isAuthenticated) {
        showLoggedIn(response.user, response.organization);
        resolve(true);
      } else {
        showLoggedOut();
        resolve(false);
      }
    });
  });
}

function showLoggedIn(user, organization) {
  authLoggedOut.classList.add('hidden');
  authLoggedIn.classList.remove('hidden');
  userEmailEl.textContent = user?.email || 'Unknown user';
  orgNameEl.textContent = organization?.name || 'No organization';
}

function showLoggedOut() {
  authLoggedOut.classList.remove('hidden');
  authLoggedIn.classList.add('hidden');
}

// Login - open web app auth page in popup
loginBtn.addEventListener('click', () => {
  // Show the token paste section
  tokenPasteSection.classList.remove('hidden');

  // Open auth page in a popup window
  chrome.windows.create({
    url: `${WEB_APP_URL}/extension-auth`,
    type: 'popup',
    width: 500,
    height: 650,
    focused: true,
  });
});

// Save manually pasted token
saveTokenBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    alert('Please paste a token first');
    return;
  }

  try {
    // Decode the JWT to get user info (JWT payload is base64)
    const parts = token.split('.');
    if (parts.length !== 3) {
      alert('Invalid token format');
      return;
    }

    const payload = JSON.parse(atob(parts[1]));
    const user = {
      id: payload.sub,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
    const organization = payload.organizationId
      ? { id: payload.organizationId, name: payload.organizationName || 'Organization' }
      : null;

    // Save to storage
    chrome.storage.local.set(
      {
        authToken: token,
        user,
        organization,
      },
      () => {
        tokenInput.value = '';
        tokenPasteSection.classList.add('hidden');
        updateStats();
      }
    );
  } catch (err) {
    alert('Invalid token: ' + err.message);
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'logout' }, () => {
    showLoggedOut();
    updateStats();
  });
});

// Update stats from backend
async function updateStats() {
  const isAuthenticated = await checkAuthStatus();

  if (!isAuthenticated) {
    totalEl.textContent = '--';
    statusDot.classList.add('warning');
    statusDot.classList.remove('offline');
    statusText.textContent = 'Login required';
    return;
  }

  try {
    // Get token from storage
    const token = await new Promise((resolve) => {
      chrome.storage.local.get(['authToken'], (data) => {
        resolve(data.authToken);
      });
    });

    const response = await fetch(`${BACKEND_URL}/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      // Token expired
      chrome.runtime.sendMessage({ type: 'logout' });
      showLoggedOut();
      totalEl.textContent = '--';
      statusDot.classList.add('warning');
      statusText.textContent = 'Session expired';
      return;
    }

    if (response.ok) {
      const data = await response.json();
      totalEl.textContent = data.total.toLocaleString();
      statusDot.classList.remove('offline', 'warning');
      statusText.textContent = 'Backend connected';
    } else {
      throw new Error('Backend error');
    }
  } catch (err) {
    totalEl.textContent = '--';
    statusDot.classList.add('offline');
    statusDot.classList.remove('warning');
    statusText.textContent = 'Backend offline';
  }
}

// Listen for storage changes (auth updates from web app)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.authToken) {
    updateStats();
  }
});

// Initial load
updateStats();

// Refresh periodically
setInterval(updateStats, 10000);
