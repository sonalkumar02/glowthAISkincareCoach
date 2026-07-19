(function () {
  let stream = null;
  let capturedImageDataUrl = '';
  let lastFocusedElement = null;

  const scanState = {
    isSubmitting: false
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-scan-trigger]');
    if (!trigger) return;

    event.preventDefault();
    openScanModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('scan-modal-open')) {
      closeScanModal();
    }
  });

  function openScanModal() {
    ensureScanModal();
    resetScanModal();
    lastFocusedElement = document.activeElement;
    document.body.classList.add('scan-modal-open');
    document.getElementById('scanModal')?.setAttribute('aria-hidden', 'false');
    document.querySelector('[data-scan-capture]')?.focus();
    startCamera();
  }

  function closeScanModal() {
    document.body.classList.remove('scan-modal-open');
    document.getElementById('scanModal')?.setAttribute('aria-hidden', 'true');
    stopCamera();

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function ensureScanModal() {
    if (document.getElementById('scanModal')) return;

    const modal = document.createElement('div');
    modal.id = 'scanModal';
    modal.className = 'scan-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-labelledby', 'scanModalTitle');
    modal.innerHTML = `
      <div class="scan-modal__panel">
        <button class="scan-modal__close" type="button" data-scan-close aria-label="Close face scan">Close</button>

        <div class="scan-modal__copy">
          <span class="card-pill">Face scan</span>
          <h2 id="scanModalTitle">Take a clear face photo</h2>
          <p>Glowth will combine this photo with your quiz answers and local environment data to build a fresher skincare routine.</p>
          <ul class="scan-instructions">
            <li>Use bright natural light.</li>
            <li>Keep your face centered and still.</li>
            <li>Remove glasses, masks, or heavy filters.</li>
            <li>Face the camera from the front.</li>
          </ul>
        </div>

        <div class="scan-camera" data-scan-camera>
          <video id="scanVideo" autoplay muted playsinline></video>
          <canvas id="scanCanvas" hidden></canvas>
          <img id="scanPreview" alt="Captured face preview" hidden>
          <p class="scan-camera__fallback" data-camera-fallback hidden>Camera preview will appear here after permission is allowed.</p>
        </div>

        <div class="scan-actions">
          <button class="dashboard-button dashboard-button-secondary" type="button" data-scan-retake hidden>Retake</button>
          <button class="dashboard-button dashboard-button-primary" type="button" data-scan-capture>Capture photo</button>
        </div>

        <form class="scan-quiz" id="scanQuiz">
          <label>
            Skin feel today
            <select name="skin_feel">
              <option value="oily">Oily</option>
              <option value="dry">Dry</option>
              <option value="combination">Combination</option>
              <option value="normal">Normal</option>
              <option value="sensitive">Sensitive</option>
            </select>
          </label>

          <label>
            Breakouts
            <select name="breakouts">
              <option value="rare">Rare</option>
              <option value="sometimes">Sometimes</option>
              <option value="often">Often</option>
            </select>
          </label>

          <label>
            Sensitivity
            <select name="sensitivity">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label>
            Main goal
            <select name="main_goal">
              <option value="clear acne">Clear acne</option>
              <option value="even tone">Even tone</option>
              <option value="repair barrier">Repair barrier</option>
              <option value="glow and hydration">Glow and hydration</option>
              <option value="oil control">Oil control</option>
            </select>
          </label>

          <label>
            Routine style
            <select name="routine_style">
              <option value="simple">Simple</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>

          <label>
            City fallback
            <input name="city" type="text" placeholder="Optional if location is blocked">
          </label>
        </form>

        <p class="scan-status" id="scanStatus" aria-live="polite"></p>

        <button class="dashboard-button dashboard-button-primary scan-submit" type="button" data-scan-submit>
          Generate routine
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeScanModal();
    });
    modal.querySelector('[data-scan-close]').addEventListener('click', closeScanModal);
    modal.querySelector('[data-scan-capture]').addEventListener('click', capturePhoto);
    modal.querySelector('[data-scan-retake]').addEventListener('click', retakePhoto);
    modal.querySelector('[data-scan-submit]').addEventListener('click', submitScan);
  }

  function resetScanModal() {
    capturedImageDataUrl = '';
    scanState.isSubmitting = false;
    setStatus('');

    const video = document.getElementById('scanVideo');
    const preview = document.getElementById('scanPreview');
    const fallback = document.querySelector('[data-camera-fallback]');
    const submit = document.querySelector('[data-scan-submit]');

    if (video) video.hidden = false;
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute('src');
    }
    if (fallback) fallback.hidden = true;
    if (submit) submit.disabled = false;

    document.querySelector('[data-scan-retake]')?.setAttribute('hidden', '');
    document.querySelector('[data-scan-capture]')?.removeAttribute('hidden');
  }

  async function startCamera() {
    const video = document.getElementById('scanVideo');
    const fallback = document.querySelector('[data-camera-fallback]');

    if (!video) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera is not available here. Please open the dashboard on localhost or HTTPS.');
      if (fallback) fallback.hidden = false;
      return;
    }

    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 960 }
        },
        audio: false
      });

      video.srcObject = stream;
      await video.play();
      setStatus('Camera ready. Center your face, then capture.');
    } catch (error) {
      console.warn('[Glowth] Camera failed:', error);
      setStatus('Camera permission failed. Allow camera access and try again.');
      if (fallback) fallback.hidden = false;
    }
  }

  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function capturePhoto() {
    const video = document.getElementById('scanVideo');
    const canvas = document.getElementById('scanCanvas');
    const preview = document.getElementById('scanPreview');

    if (!video || !canvas || !preview) return;

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 720;

    if (!width || !height) {
      setStatus('Camera is still loading. Try capture again in a second.');
      return;
    }

    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    capturedImageDataUrl = canvas.toDataURL('image/jpeg', 0.78);
    localStorage.setItem('glowth_latest_scan_photo', capturedImageDataUrl);
    document.dispatchEvent(new CustomEvent('glowth:scan-photo-updated', {
      detail: { image: capturedImageDataUrl }
    }));

    preview.src = capturedImageDataUrl;
    preview.hidden = false;
    video.hidden = true;

    document.querySelector('[data-scan-retake]')?.removeAttribute('hidden');
    document.querySelector('[data-scan-capture]')?.setAttribute('hidden', '');

    stopCamera();
    setStatus('Photo captured. Answer the quiz and generate your routine.');
  }

  function retakePhoto() {
    capturedImageDataUrl = '';

    const preview = document.getElementById('scanPreview');
    const video = document.getElementById('scanVideo');
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute('src');
    }
    if (video) video.hidden = false;

    document.querySelector('[data-scan-retake]')?.setAttribute('hidden', '');
    document.querySelector('[data-scan-capture]')?.removeAttribute('hidden');

    startCamera();
  }

  function getQuizData() {
    const form = document.getElementById('scanQuiz');
    if (!form) return {};
    return Object.fromEntries(new FormData(form).entries());
  }

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ permission: 'unsupported' });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            permission: 'granted',
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy_meters: position.coords.accuracy
          });
        },
        (error) => {
          resolve({
            permission: 'denied_or_unavailable',
            message: error.message
          });
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 20 }
      );
    });
  }

  function getEnvironmentData() {
    const now = new Date();
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      local_time: now.toISOString(),
      local_hour: now.getHours(),
      language: navigator.language || '',
      platform: navigator.platform || '',
      online: navigator.onLine,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixel_ratio: window.devicePixelRatio || 1
      }
    };
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ''));
  }

  function getUserId() {
    return localStorage.getItem('glowth_user_id');
  }

  function rememberResolvedUser(user = {}) {
    if (!user.id && !user.user_id) return;

    const resolvedId = user.id || user.user_id;
    localStorage.setItem('glowth_user_id', resolvedId);
    if (user.email) localStorage.setItem('glowth_user_email', user.email);
    if (user.name) localStorage.setItem('glowth_user_name', user.name);
  }

  async function findUserIdByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || typeof supabaseClient === 'undefined') return null;

    const lookups = [
      {
        table: 'users',
        select: 'id,email,name',
        idKey: 'id'
      },
      {
        table: 'profiles',
        select: 'user_id,email,name',
        idKey: 'user_id'
      }
    ];

    for (const lookup of lookups) {
      const { data, error } = await supabaseClient
        .from(lookup.table)
        .select(lookup.select)
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[Glowth] ${lookup.table} email lookup failed:`, error);
        continue;
      }

      const resolvedId = data?.[lookup.idKey];
      if (isUuid(resolvedId)) {
        rememberResolvedUser({
          id: resolvedId,
          email: data.email || normalizedEmail,
          name: data.name
        });

        return resolvedId;
      }
    }

    return null;
  }

  async function publicUserExists(userId) {
    if (!isUuid(userId) || typeof supabaseClient === 'undefined') return false;

    const { data, error } = await supabaseClient
      .from('users')
      .select('id')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[Glowth] users id check failed:', error);
      return false;
    }

    return data?.id === userId;
  }

  async function ensurePublicUserRecord(user = {}) {
    const userId = user.id || user.user_id;
    if (!isUuid(userId) || typeof supabaseClient === 'undefined') {
      return null;
    }

    if (await publicUserExists(userId)) {
      rememberResolvedUser({
        id: userId,
        email: user.email,
        name: user.name
      });
      return userId;
    }

    const email = user.email || localStorage.getItem('glowth_user_email') || '';
    const name = user.name || localStorage.getItem('glowth_user_name') || 'Glowth User';
    const { data, error } = await supabaseClient
      .from('users')
      .upsert({
        id: userId,
        email,
        name,
        location: localStorage.getItem('glowth_user_location') || 'India'
      }, { onConflict: 'id' })
      .select('id,email,name')
      .single();

    if (error) {
      console.warn('[Glowth] users self-heal upsert failed:', error);
      const existingId = await findUserIdByEmail(email);
      if (existingId) {
        return existingId;
      }
      throw new Error(`Could not link this account to the public users table: ${error.message || 'Supabase rejected the request'}`);
    }

    rememberResolvedUser(data);
    return data.id;
  }

  async function ensurePublicUserForAuth(authUser) {
    return ensurePublicUserRecord({
      id: authUser?.id,
      email: authUser?.email,
      name: authUser?.user_metadata?.name
    });
  }

  async function resolveScanUserId() {
    const storedUserId = getUserId();
    const email = (localStorage.getItem('glowth_user_email') || '').trim().toLowerCase();

    if (isUuid(storedUserId) && await publicUserExists(storedUserId)) {
      return storedUserId;
    }

    const resolvedId = await findUserIdByEmail(email);
    if (resolvedId) {
      return resolvedId;
    }

    if (isUuid(storedUserId)) {
      const ensuredStoredId = await ensurePublicUserRecord({
        id: storedUserId,
        email,
        name: localStorage.getItem('glowth_user_name') || 'Glowth User'
      });
      if (ensuredStoredId) {
        return ensuredStoredId;
      }
    }

    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth?.getUser) {
      const { data: authData } = await supabaseClient.auth.getUser();
      const ensuredId = await ensurePublicUserForAuth(authData?.user);
      if (ensuredId) {
        return ensuredId;
      }
    }

    if (!email || typeof supabaseClient === 'undefined') {
      throw new Error('Your login session is missing a valid account. Please complete onboarding again.');
    }

    if (!isUuid(storedUserId)) {
      throw new Error('No valid Supabase UUID was found for this email. Please login again or complete onboarding once.');
    }

    throw new Error('This account is not linked to a public users row yet. Complete onboarding once, then scan again.');
  }

  function getScanEndpoint() {
    if (typeof GLOWTH !== 'undefined' && typeof GLOWTH.url === 'function') {
      return GLOWTH.url('scanFace');
    }
    return '';
  }

  async function uploadScanPhoto(userId) {
    if (!capturedImageDataUrl || typeof supabaseClient === 'undefined') {
      return {};
    }

    try {
      const blob = dataUrlToBlob(capturedImageDataUrl);
      const imagePath = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabaseClient.storage
        .from('face-scans')
        .upload(imagePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (error) {
        console.warn('[Glowth] Scan photo upload failed:', error);
        return {};
      }

      const { data } = supabaseClient.storage
        .from('face-scans')
        .getPublicUrl(imagePath);

      return {
        image_path: imagePath,
        image_url: data?.publicUrl || ''
      };
    } catch (error) {
      console.warn('[Glowth] Scan photo upload failed:', error);
      return {};
    }
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, base64] = String(dataUrl).split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64 || dataUrl);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  async function submitScan() {
    const submit = document.querySelector('[data-scan-submit]');

    if (scanState.isSubmitting) return;

    if (!getUserId()) {
      setStatus('Please login before scanning.', 'error');
      return;
    }

    if (!capturedImageDataUrl) {
      setStatus('Capture your face photo first.', 'error');
      return;
    }

    const endpoint = getScanEndpoint();
    if (!endpoint) {
      setStatus('Scan endpoint is missing in config.js.', 'error');
      return;
    }

    scanState.isSubmitting = true;
    if (submit) submit.disabled = true;
    setStatus('Verifying account and sending scan to Glowth AI...');

    try {
      const userId = await resolveScanUserId();
      const [location, quiz] = await Promise.all([
        getLocation(),
        Promise.resolve(getQuizData())
      ]);

      localStorage.setItem('glowth_latest_scan_photo', capturedImageDataUrl);
      const uploadedPhoto = await uploadScanPhoto(userId);
      if (uploadedPhoto.image_url) {
        localStorage.setItem('glowth_latest_scan_photo', uploadedPhoto.image_url);
      }

      const payload = {
        user_id: userId,
        email: localStorage.getItem('glowth_user_email') || '',
        image_url: uploadedPhoto.image_url || '',
        image_path: uploadedPhoto.image_path || '',
        image_data_url: capturedImageDataUrl,
        image_base64: capturedImageDataUrl.split(',')[1] || capturedImageDataUrl,
        image_mime: 'image/jpeg',
        quiz,
        location,
        environment: getEnvironmentData(),
        source: 'dashboard_face_scan',
        captured_at: new Date().toISOString()
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await readJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Scan failed in n8n.');
      }

      setStatus('Scan complete. Refreshing dashboard with your new routine...');

      completeFirstScan();

      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      console.error('[Glowth] Scan submit failed:', error);
      scanState.isSubmitting = false;
      if (submit) submit.disabled = false;
      setStatus(getFriendlySubmitError(error, endpoint), 'error');
    }
  }

  function getFriendlySubmitError(error, endpoint) {
    const message = String(error?.message || '');

    if (message.toLowerCase().includes('failed to fetch')) {
      return `Could not reach n8n. Open the AI recommendation Webhook node, click Listen for test event, then try again. Endpoint: ${endpoint}`;
    }

    return message || 'Scan failed. Try again.';
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        success: response.ok,
        message: text
      };
    }
  }

  function setStatus(message, type = 'info') {
    const status = document.getElementById('scanStatus');
    if (!status) return;

    status.textContent = message;
    status.dataset.status = type;
  }

  window.GlowthScan = {
    open: openScanModal,
    close: closeScanModal
  };

  /* =========================================
   SCAN STREAK
========================================= */

function completeFirstScan() {
  const now = new Date();
  const todayKey = streakDateKey(now);
  const lastScanDay = localStorage.getItem('glowth_last_streak_scan_day');

  if (lastScanDay === todayKey) {
    window.updateStreakProgress?.();
    return;
  }

  const scanDates = readStreakScanDates();
  scanDates.push(now.toISOString());

  localStorage.setItem('glowth-first-scan', 'true');
  localStorage.setItem('glowth_last_streak_scan_day', todayKey);
  localStorage.setItem('glowth_streak_scan_dates', JSON.stringify([...new Set(scanDates)]));

  window.updateStreakProgress?.();

  const streak = Number(localStorage.getItem('glowth_streak_days') || 0);
  const count = document.getElementById('header-streak-count');
  const days = document.getElementById('header-streak-days');

  if (count) count.textContent = streak;
  if (days) days.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;

  launchFireCelebration();
}

function streakDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function readStreakScanDates() {
  try {
    const saved = JSON.parse(localStorage.getItem('glowth_streak_scan_dates') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function launchFireCelebration() {

  const fire =
    document.createElement('div');

  fire.className =
    'streak-fire-burst';

  fire.textContent = '*';

  document.body.appendChild(fire);

  setTimeout(() => {
    fire.remove();
  }, 900);

}

})();


