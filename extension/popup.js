const BACKEND_URL = 'http://localhost:3847';

async function updateStats() {
  const totalEl = document.getElementById('total');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  try {
    const response = await fetch(`${BACKEND_URL}/stats`);
    if (response.ok) {
      const data = await response.json();
      totalEl.textContent = data.total.toLocaleString();
      statusDot.classList.remove('offline');
      statusText.textContent = 'Backend connected';
    } else {
      throw new Error('Backend error');
    }
  } catch (err) {
    totalEl.textContent = '--';
    statusDot.classList.add('offline');
    statusText.textContent = 'Backend offline';
  }
}

// Update on load and periodically
updateStats();
setInterval(updateStats, 5000);
