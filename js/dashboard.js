console.log('dashboard.js loaded');

// document.addEventListener('DOMContentLoaded', async () => {

//   // The live Supabase renderer below owns the dashboard now.
//   // This older n8n-era renderer is intentionally dormant to avoid stale overwrites.
  

//   try {

//     const userId =
//       localStorage.getItem('glowth_user_id');

//     if (!userId) {
//       console.error('No user ID');
//       return;
//     }

//     // GET RECOMMENDATION
//     const { data: recommendation, error: recError } =
//       await supabaseClient
//         .from('recommendations')
//         .select('*')
//         .eq('user_id', userId)
//         .order('created_at', { ascending: false })
//         .limit(1)
//         .maybeSingle();

//     if (recError) {
//       console.error(recError);
//       return;
//     }

//     // GET ENVIRONMENT
//     const { data: environment } =
//       await supabaseClient
//         .from('environment_data')
//         .select('*')
//         .eq('user_id', userId)
//         .order('created_at', { ascending: false })
//         .limit(1)
//         .maybeSingle();

//     console.log('Recommendation:', recommendation);
//     window.REC = recommendation;
//     if (!recommendation) {
//       console.error('No recommendation found for this user');
//       return; 
//     }
//     console.log('Environment:', environment);

//     renderOverview(recommendation, environment);

//     renderRecommendationProducts({
//       recommendation
//     });

//     renderIngredients({
//       recommendation
//     });

//     renderRoutine(recommendation);

//   } catch (err) {
//     console.error(err);
//   }

// });



function shorten(text = '', maxLength = 60) {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/*
  Dashboard live-data renderer.
  Keeps the existing static HTML, then overwrites the cards with Supabase data:
  - latest scan metrics
  - curated_products image/link cards
  - short 2-step AM and 2-step PM routines
*/

async function renderLiveDashboard() {
  const userId = localStorage.getItem('glowth_user_id');
  if (!userId || typeof supabaseClient === 'undefined') return;

  try {
    const [profileRes, settingsRes, recommendationRes, productsRes, scanRes, scanHistoryRes] = await Promise.all([
      supabaseClient
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),

      supabaseClient
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),

      supabaseClient
        .from('recommendations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseClient
        .from('curated_products')
        .select('*')
        .eq('user_id', userId)
        .order('display_order', { ascending: true }),

      supabaseClient
        .from('skin_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseClient
        .from('skin_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(14)
    ]);

    if (profileRes.error) console.warn('[Glowth] profiles:', profileRes.error);
    if (settingsRes.error) console.warn('[Glowth] user_settings:', settingsRes.error);
    if (recommendationRes.error) console.warn('[Glowth] recommendations:', recommendationRes.error);
    if (productsRes.error) console.warn('[Glowth] curated_products:', productsRes.error);
    if (scanRes.error) console.warn('[Glowth] skin_scans:', scanRes.error);
    if (scanHistoryRes.error) console.warn('[Glowth] skin_scans history:', scanHistoryRes.error);

    applyProfileRecord(profileRes.data || {});
    applyProfileRecord(settingsRes.data || {});

    const recommendation = normalizeRecommendationRecord(recommendationRes.data || {});
    const products = normalizeProducts(productsRes.data || []);
    const scan = {
      ...flattenMetrics(recommendation),
      ...recommendation,
      ...compactObject(scanRes.data || {})
    };

    window.GLOWTH_PRODUCTS = products;
    window.GLOWTH_RECOMMENDATION = recommendation;
    window.GLOWTH_SCAN = scan;
    window.GLOWTH_SCAN_HISTORY = scanHistoryRes.data || [];

    renderOverview(scan, products);
    renderProductSections(products);
    renderIngredients({ recommendation });
    renderRoutineFromProducts(products, recommendation);
    renderRecommendationSupport(recommendation, products);
    renderProfileScanProgress(window.GLOWTH_SCAN_HISTORY, scan);
    renderProfileEditorValues();
  } catch (error) {
    console.error('[Glowth] live dashboard render failed:', error);
  }
}

window.GlowthDashboard = {
  render: renderLiveDashboard
};

document.addEventListener('DOMContentLoaded', renderLiveDashboard);
document.addEventListener('glowth:page-swapped', renderLiveDashboard);
document.addEventListener('glowth:scan-photo-updated', () => {
  renderSkinAnalysisScene(window.GLOWTH_SCAN || {});
});
document.addEventListener('DOMContentLoaded', initProfileEditor);
document.addEventListener('glowth:page-swapped', initProfileEditor);

document.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-profile-edit]');
  if (!editButton) return;

  event.preventDefault();
  openProfileEditor();
});

document.addEventListener('submit', (event) => {
  if (event.target?.id !== 'profileEditForm') return;

  event.preventDefault();
  saveProfileEditor(new FormData(event.target));
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-profile-editor-close]') || event.target.id === 'profileEditModal') {
    closeProfileEditor();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('profile-editor-open')) {
    closeProfileEditor();
  }
});

function initProfileEditor() {
  if (!document.getElementById('identity-card')) return;

  ensureProfileEditor();
  renderProfileEditorValues();
}

function getProfileEditorData() {
  const recommendation = window.GLOWTH_RECOMMENDATION || {};
  const scan = window.GLOWTH_SCAN || {};
  const liveSkinType = scan.skin_type || recommendation.skin_type || recommendation.recommendation?.skin_type || '';
  const quizAnswers = readStoredQuizAnswers();

  return {
    name: localStorage.getItem('glowth_user_name') || 'Glowth User',
    email: localStorage.getItem('glowth_user_email') || 'Connected locally',
    timezone: localStorage.getItem('glowth_user_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Calcutta',
    primaryGoal: localStorage.getItem('glowth_primary_goal') || quizAnswers.goals || 'Clearer tone',
    skinType: formatProfileSkinType(liveSkinType || localStorage.getItem('glowth_skin_type') || quizAnswers.skinType || 'Combination skin'),
    concernFocus: localStorage.getItem('glowth_concern_focus') || quizAnswers.concern || 'Acne + tone',
    conditions: localStorage.getItem('glowth_conditions') || quizAnswers.conditions || 'No known conditions',
    lifestyle: localStorage.getItem('glowth_lifestyle') || quizAnswers.lifestyle || 'Mostly indoors',
    routineType: localStorage.getItem('glowth_routine_type') || 'Night routine'
  };
}

function applyProfileRecord(profile = {}) {
  const answers = normalizeQuizAnswers(profile.quiz_answers || profile.answers || profile.onboarding_answers);
  const fields = {
    glowth_user_name: profileValue(profile, ['name', 'full_name', 'display_name']),
    glowth_user_email: profileValue(profile, ['email']),
    glowth_skin_type: profileValue(profile, ['skin_type', 'skinType'], answers.skinType),
    glowth_concern_focus: profileValue(profile, ['concern_focus', 'concern', 'concerns'], answers.concern),
    glowth_primary_goal: profileValue(profile, ['primary_goal', 'goal', 'goals'], answers.goals),
    glowth_conditions: profileValue(profile, ['conditions', 'skin_conditions'], answers.conditions),
    glowth_lifestyle: profileValue(profile, ['lifestyle', 'daily_context'], answers.lifestyle)
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (value) localStorage.setItem(key, value);
  });

  if (Object.keys(answers).length) {
    localStorage.setItem('glowth_quiz_answers', JSON.stringify(answers));
    localStorage.setItem('glowth_quiz_completed', 'true');
  }
}

function profileValue(profile = {}, keys = [], fallback = '') {
  for (const key of keys) {
    if (profile[key] !== undefined && profile[key] !== null && profile[key] !== '') {
      return formatProfileValue(profile[key]);
    }
  }

  return formatProfileValue(fallback);
}

function normalizeQuizAnswers(value) {
  let source = value || {};

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }

  const normalized = {
    skinType: formatProfileValue(source.skinType || source.skin_type),
    concern: formatProfileValue(source.concern || source.concern_focus || source.concerns),
    goals: formatProfileValue(source.goals || source.goal || source.primary_goal),
    conditions: formatProfileValue(source.conditions || source.skin_conditions),
    lifestyle: formatProfileValue(source.lifestyle || source.daily_context)
  };

  return Object.entries(normalized).reduce((acc, [key, item]) => {
    if (item) acc[key] = item;
    return acc;
  }, {});
}

function readStoredQuizAnswers() {
  return normalizeQuizAnswers(localStorage.getItem('glowth_quiz_answers'));
}

function formatProfileValue(value) {
  if (Array.isArray(value)) {
    return value.map(formatProfileValue).filter(Boolean).join(', ');
  }

  if (value && typeof value === 'object') {
    return formatProfileValue(value.label || value.value || value.title || value.name || '');
  }

  return String(value || '').trim();
}

function formatProfileSkinType(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Combination skin';
  if (/skin$/i.test(raw)) return raw;
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} skin`;
}

function ensureProfileEditor() {
  if (document.getElementById('profileEditModal')) return;

  const modal = document.createElement('div');
  modal.id = 'profileEditModal';
  modal.className = 'profile-editor-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'profileEditTitle');
  modal.innerHTML = `
    <div class="profile-editor-panel">
      <button class="profile-editor-close" type="button" data-profile-editor-close aria-label="Close profile editor">Close</button>
      <div class="profile-editor-head">
        <span class="card-pill">Profile editor</span>
        <h3 id="profileEditTitle">Edit your Glowth identity</h3>
        <p>Keep this practical: the profile should tell Glowth who you are and what you care about right now.</p>
      </div>
      <form class="profile-editor-form" id="profileEditForm">
        <label>
          Name
          <input name="name" type="text" autocomplete="name" required>
        </label>
        <label>
          Email
          <input name="email" type="email" autocomplete="email" placeholder="you@example.com">
        </label>
        <label>
          Timezone
          <input name="timezone" type="text" autocomplete="off">
        </label>
        <label>
          Primary goal
          <input name="primaryGoal" type="text" placeholder="Clear acne, glow, repair barrier">
        </label>
        <label>
          Skin type
          <select name="skinType">
            <option>Oily skin</option>
            <option>Dry skin</option>
            <option>Combination skin</option>
            <option>Sensitive skin</option>
            <option>Normal skin</option>
          </select>
        </label>
        <label>
          Concern focus
          <input name="concernFocus" type="text" placeholder="Acne + tone">
        </label>
        <label>
          Routine type
          <select name="routineType">
            <option>Morning routine</option>
            <option>Night routine</option>
            <option>Morning + night routine</option>
            <option>Simple routine</option>
          </select>
        </label>
        <div class="profile-editor-actions">
          <button class="dashboard-button dashboard-button-secondary" type="button" data-profile-editor-close>Cancel</button>
          <button class="dashboard-button dashboard-button-primary" type="submit">Save profile</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
}

function openProfileEditor() {
  ensureProfileEditor();
  const data = getProfileEditorData();
  const form = document.getElementById('profileEditForm');
  if (!form) return;

  Object.entries(data).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });

  document.body.classList.add('profile-editor-open');
  form.elements.name?.focus();
}

function closeProfileEditor() {
  document.body.classList.remove('profile-editor-open');
}

function saveProfileEditor(formData) {
  const nextProfile = {
    name: String(formData.get('name') || '').trim() || 'Glowth User',
    email: String(formData.get('email') || '').trim() || 'Connected locally',
    timezone: String(formData.get('timezone') || '').trim() || 'Asia/Calcutta',
    primaryGoal: String(formData.get('primaryGoal') || '').trim() || 'Clearer tone',
    skinType: String(formData.get('skinType') || '').trim() || 'Combination skin',
    concernFocus: String(formData.get('concernFocus') || '').trim() || 'Acne + tone',
    routineType: String(formData.get('routineType') || '').trim() || 'Night routine'
  };

  localStorage.setItem('glowth_user_name', nextProfile.name);
  localStorage.setItem('glowth_user_email', nextProfile.email);
  localStorage.setItem('glowth_user_timezone', nextProfile.timezone);
  localStorage.setItem('glowth_primary_goal', nextProfile.primaryGoal);
  localStorage.setItem('glowth_skin_type', nextProfile.skinType);
  localStorage.setItem('glowth_concern_focus', nextProfile.concernFocus);
  localStorage.setItem('glowth_routine_type', nextProfile.routineType);

  renderProfileEditorValues();
  closeProfileEditor();
}

function renderProfileEditorValues() {
  const data = getProfileEditorData();
  const shortSkin = data.skinType.replace(/\s*skin$/i, '') || data.skinType;
  const initials = data.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'GU';

  document.querySelectorAll('[data-user-name]').forEach((node) => {
    node.textContent = data.name;
  });

  document.querySelectorAll('[data-user-avatar]').forEach((node) => {
    if (!localStorage.getItem('glowth_user_photo')) {
      node.textContent = initials;
    }
  });

  document.querySelectorAll('#skin-type-value').forEach((node) => {
    node.textContent = data.skinType;
  });

  setText('skin-type-short-value', shortSkin);
  setText('skin-type-metric-value', shortSkin);
  setText('concern-focus-value', data.concernFocus);
  setText('concern-focus-short-value', data.concernFocus);
  setText('concern-focus-metric-value', data.concernFocus);
  setText('routine-type-value', data.routineType);
  setText('profile-email', data.email);
  setText('profile-timezone', data.timezone);
  setText('profile-primary-goal', data.primaryGoal);
  renderQuizSummaryCard(data);
}

function renderQuizSummaryCard(data = {}) {
  const list = document.querySelector('#goals-card .card-list');
  if (!list) return;

  const rows = [
    ['Skin type', data.skinType],
    ['Concern', data.concernFocus],
    ['Goal', data.primaryGoal],
    ['Conditions', data.conditions],
    ['Lifestyle', data.lifestyle]
  ].filter(([, value]) => value);

  list.innerHTML = rows
    .map(([label, value]) => `
      <li>
        <span>${escapeHtml(label)}</span>
        <strong><span class="scan-value">${escapeHtml(shorten(value, 34))}</span></strong>
      </li>
    `)
    .join('');
}

function renderProfileScanProgress(scanHistory = [], latestScan = {}) {
  if (!document.getElementById('scan-progress-card')) return;

  const scans = [...(scanHistory || [])]
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at || b.captured_at || 0) - new Date(a.created_at || a.captured_at || 0));
  const latest = scans[0] || latestScan || {};
  const previous = scans[1] || {};
  const latestScore = scanScore(latest);
  const previousScore = scanScore(previous);
  const improvement = previousScore === null ? 0 : Math.round((latestScore || 0) - previousScore);
  const positiveImprovement = Math.max(0, Math.min(100, improvement));

  setText('profile-total-scans', scans.length);
  setText('profile-scan-count', `${scans.length} ${scans.length === 1 ? 'scan' : 'scans'}`);
  setText('profile-latest-score', latestScore ?? '--');
  setText('profile-previous-score', previousScore ?? '--');
  setText('profile-progress-value', positiveImprovement);
  setText('profile-daily-change', `${improvement > 0 ? '+' : ''}${improvement}`);

  document.getElementById('profile-total-scans-track')?.style.setProperty('--fill', `${Math.min(100, scans.length * 12)}%`);
  document.getElementById('profile-progress-ring')?.style.setProperty('--ring-fill', `${positiveImprovement}%`);

  renderProfileBeforeAfter(latest, previous, improvement);
  renderProfileWeeklyChart(scans);
  renderProfileTimeline(scans);
  initProfileMilestones();
}

function scanScore(scan = {}) {
  if (!scan || !Object.keys(scan).length) return null;
  const value = metricValue(scan, ['skin_score', 'skinscore', 'score', 'overall_score'], null);
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function scanDateLabel(scan = {}) {
  const date = scan.created_at || scan.captured_at || scan.updated_at;
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderProfileBeforeAfter(latest = {}, previous = {}, improvement = 0) {
  const beforePhoto = getLatestScanPhoto(previous);
  const afterPhoto = getLatestScanPhoto(latest);

  setProfileScanImage(document.getElementById('profile-before-photo'), beforePhoto, 'Previous face scan');
  setProfileScanImage(document.getElementById('profile-after-photo'), afterPhoto, 'Latest face scan');
  setText('profile-before-caption', beforePhoto ? `${scanDateLabel(previous)} before scan` : 'Scan one more time to create a before image.');
  setText('profile-after-caption', afterPhoto ? `${scanDateLabel(latest)} latest scan` : 'Your latest scan image will appear here.');

  const changeItems = [
    metricChangeLine('Skin score', scanScore(latest), scanScore(previous), 'pts'),
    metricChangeLine('Hydration', metricValue(latest, ['hydration', 'hydration_score'], null), metricValue(previous, ['hydration', 'hydration_score'], null), '%'),
    metricChangeLine('Acne points', metricValue(latest, ['acne', 'acne_score', 'active_acne'], null), metricValue(previous, ['acne', 'acne_score', 'active_acne'], null), 'pts', true)
  ].filter(Boolean);
  const nextGoal = improvement >= 8
    ? 'Hold routine steady for 3 more scans'
    : improvement >= 1
      ? 'Improve hydration and reduce irritation'
      : 'Rebuild consistency with one simple scan tomorrow';

  renderSimpleList('profile-change-list', changeItems.length ? changeItems : [
    { label: 'Need two scans', value: 'No comparison yet' }
  ]);
  renderSimpleList('profile-next-list', [
    { label: 'Next goal', value: nextGoal },
    { label: 'Focus', value: nextGoal.includes('hydration') ? 'Hydration' : 'Consistency' }
  ]);
}

function setProfileScanImage(img, src, alt) {
  if (!img) return;
  if (src) {
    img.src = src;
    img.alt = alt;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
}

function metricChangeLine(label, latest, previous, suffix = '', lowerIsBetter = false) {
  if (latest === null || latest === undefined || previous === null || previous === undefined) return null;
  const latestNumber = Number(String(latest).replace('%', ''));
  const previousNumber = Number(String(previous).replace('%', ''));
  if (!Number.isFinite(latestNumber) || !Number.isFinite(previousNumber)) return null;

  const delta = Math.round(latestNumber - previousNumber);
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const value = `${delta > 0 ? '+' : ''}${delta}${suffix ? ` ${suffix}` : ''}`;
  return { label, value: better ? `${value} improved` : delta === 0 ? 'No change' : `${value} watch` };
}

function renderProfileWeeklyChart(scans = []) {
  const chart = document.getElementById('profile-weekly-chart');
  if (!chart) return;

  const scanByDay = new Map();
  scans.forEach((scan) => {
    const key = dayKey(scan.created_at || scan.captured_at || scan.updated_at);
    if (key && !scanByDay.has(key)) scanByDay.set(key, scan);
  });

  const values = lastSevenDays().map((day) => {
    const scan = scanByDay.get(day.key);
    if (!scan) return { ...day, missed: true, value: 0 };
    const previous = findPreviousScan(scans, scan);
    const score = scanScore(scan) || 0;
    const previousScore = scanScore(previous) ?? score;
    return { ...day, missed: false, value: Math.max(0, Math.round(score - previousScore)) };
  });
  const completed = values.filter((day) => !day.missed);
  const average = completed.length ? Math.round(completed.reduce((sum, day) => sum + day.value, 0) / completed.length) : 0;

  setText('profile-weekly-average', `${average}% avg`);
  chart.innerHTML = values.map((day) => `
    <div class="progress-bar ${day.missed ? 'progress-bar--missed' : ''}" style="--bar: ${day.missed ? 12 : Math.max(18, day.value * 6)}%;">
      <span>${day.missed ? 'x' : `${day.value}%`}</span>
      <label>${escapeHtml(day.label)}</label>
    </div>
  `).join('');
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { key: dayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3) };
  });
}

function dayKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function findPreviousScan(scans = [], scan = {}) {
  const scanTime = new Date(scan.created_at || scan.captured_at || scan.updated_at || 0).getTime();
  return scans.find((item) => {
    const itemTime = new Date(item.created_at || item.captured_at || item.updated_at || 0).getTime();
    return itemTime < scanTime;
  });
}

function renderProfileTimeline(scans = []) {
  const list = document.getElementById('profile-timeline-list');
  if (!list) return;

  const items = scans.slice(0, 4).map((scan, index) => {
    const previous = scans[index + 1] || {};
    const score = scanScore(scan);
    const delta = score - (scanScore(previous) ?? score);
    const summary = cleanText(scan.summary || scan.skin_summary || scan.change_summary || '');
    return {
      date: scanDateLabel(scan),
      title: `${score ?? '--'} skin score`,
      copy: summary || `${delta > 0 ? '+' : ''}${delta || 0} point change from previous scan.`
    };
  });

  list.innerHTML = (items.length ? items : [
    { date: 'Start', title: 'No scan timeline yet', copy: 'Run your first face scan to build a visible history.' }
  ]).map((item) => `
    <div class="timeline-item">
      <span class="timeline-dot"></span>
      <div>
        <strong>${escapeHtml(item.date)} - ${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(shorten(item.copy, 88))}</p>
      </div>
    </div>
  `).join('');
}

function initProfileMilestones() {
  const form = document.getElementById('profile-milestone-form');
  if (!form || form.dataset.wired === 'true') return;

  const focus = document.getElementById('profile-milestone-focus');
  const target = document.getElementById('profile-milestone-target');
  const saved = readMilestone();

  if (focus) focus.value = saved.focus;
  if (target) target.value = saved.target;
  renderMilestone(saved);

  form.dataset.wired = 'true';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const milestone = {
      focus: focus?.value || 'Clear acne',
      target: target?.value || 'Scan 5 times this week'
    };
    localStorage.setItem('glowth_profile_milestone', JSON.stringify(milestone));
    renderMilestone(milestone);
  });
}

function readMilestone() {
  try {
    return {
      focus: 'Clear acne',
      target: 'Scan 5 times this week',
      ...JSON.parse(localStorage.getItem('glowth_profile_milestone') || '{}')
    };
  } catch {
    return { focus: 'Clear acne', target: 'Scan 5 times this week' };
  }
}

function renderMilestone(milestone = readMilestone()) {
  renderSimpleList('profile-milestone-list', [
    { label: 'Focus', value: milestone.focus },
    { label: 'Target', value: milestone.target }
  ]);
}

function renderSimpleList(id, items = []) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = items.map((item) => `
    <li><span>${escapeHtml(item.label)}</span><strong><span class="scan-value">${escapeHtml(item.value)}</span></strong></li>
  `).join('');
}

function normalizeRecommendationRecord(record = {}) {
  return {
    ...record,
    morning_routine: parseJsonArray(record.morning_routine),
    evening_routine: parseJsonArray(record.evening_routine),
    key_ingredients: parseJsonArray(record.key_ingredients),
    avoid_ingredients: parseJsonArray(record.avoid_ingredients),
    tips: parseJsonArray(record.tips)
  };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value !== 'string') return [value];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [value];
  }
}

function flattenMetrics(source = {}) {
  const nested = [
    source.analysis,
    source.scan,
    source.skin,
    source.skin_analysis,
    source.metrics,
    source.result,
    source.raw_result,
    source.scan_json,
    source.analysis_json,
    source.recommendation
  ].filter(Boolean);

  return nested.reduce((acc, item) => {
    if (typeof item === 'string') {
      try {
        return { ...acc, ...JSON.parse(item) };
      } catch {
        return acc;
      }
    }

    if (typeof item === 'object') {
      return { ...acc, ...item };
    }

    return acc;
  }, {});
}

function compactObject(source = {}) {
  return Object.entries(source).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeProducts(products = []) {
  return products
    .filter(Boolean)
    .map((product, index) => ({
      user_id: product.user_id || '',
      product_type: cleanText(product.product_type || product.type || 'Care'),
      product_name: cleanProductName(product.product_name || product.name || product.product_type || 'Recommended product'),
      match_score: Number(product.match_score || 90 - index * 2),
      why_it_helps: cleanSentence(product.why_it_helps || product.description || 'Chosen for your current skin profile.'),
      routine_time: cleanRoutineTime(product.routine_time || product.routine || (index < 2 ? 'morning' : 'evening')),
      product_url: product.product_url || product.link || '',
      image_url: product.image_url || product.thumbnail || '',
      display_order: Number(product.display_order || index + 1),
      source: product.source || ''
    }))
    .sort((a, b) => a.display_order - b.display_order);
}

function productRole(product = {}) {
  const text = `${product.product_type || ''} ${product.product_name || ''}`.toLowerCase();
  if (text.includes('cleanse') || text.includes('cleanser')) return 'cleanser';
  if (text.includes('treat') || text.includes('serum') || text.includes('acid') || text.includes('niacinamide') || text.includes('salicylic')) return 'treatment';
  if (text.includes('spf') || text.includes('sunscreen') || text.includes('protect')) return 'protect';
  if (text.includes('moistur') || text.includes('cream') || text.includes('barrier')) return 'moisturizer';
  return 'care';
}

function withRoutineType(product = {}, productType = '') {
  return {
    ...product,
    product_type: productType || product.product_type
  };
}

function cleanText(value = '') {
  return String(value).replace(/^=+/, '').replace(/\s+/g, ' ').trim();
}

function cleanProductName(value = '') {
  return cleanText(value)
    .replace(/\be\.g\.,?.*$/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+for\s*$/i, '')
    .trim() || 'Recommended product';
}

function cleanSentence(value = '', maxLength = 118) {
  const cleaned = cleanText(value)
    .replace(/\s+/g, ' ')
    .replace(/^because\s+/i, '');

  return shorten(cleaned, maxLength);
}

function cleanRoutineTime(value = '') {
  const text = cleanText(value).toLowerCase();
  if (text.includes('evening') || text.includes('night') || text === 'pm') return 'Evening';
  return 'Morning';
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node && value !== undefined && value !== null && value !== '') {
    node.textContent = value;
  }
}

function metricValue(source = {}, keys = [], fallback = '') {
  const stack = [source, flattenMetrics(source)];

  for (const item of stack) {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
    }

    const lowerEntries = Object.entries(item).reduce((acc, [key, value]) => {
      acc[key.toLowerCase().replace(/[\s-]/g, '_')] = value;
      return acc;
    }, {});

    for (const key of keys) {
      const normalizedKey = key.toLowerCase().replace(/[\s-]/g, '_');
      if (lowerEntries[normalizedKey] !== undefined && lowerEntries[normalizedKey] !== null && lowerEntries[normalizedKey] !== '') {
        return lowerEntries[normalizedKey];
      }
    }
  }

  return fallback;
}

function asPercent(value, fallback = 0) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const number = Number(String(raw).replace('%', ''));
  if (Number.isNaN(number)) return `${fallback}%`;
  return `${Math.round(number)}%`;
}

function renderOverview(scan = {}, products = []) {
  const skinScore = metricValue(scan, ['skin_score', 'skinscore', 'score', 'overall_score'], 84);
  const hydration = metricValue(scan, ['hydration', 'hydration_score', 'hydration_percent', 'hydration_percentage'], 72);
  const acne = metricValue(scan, ['acne', 'active_acne', 'acne_count', 'acne_points', 'acne_score'], 2);
  const oilBalance = metricValue(scan, ['oil_balance', 'oil', 'oil_score', 'sebum_balance'], 68);
  const pigmentation = metricValue(scan, ['pigmentation', 'pigmentation_score', 'pigmentation_percent'], 10);
  const glowStreak = metricValue(scan, ['glow_streak', 'streak', 'routine_streak', 'days'], '7 days');

  setText('overview-skin-score', skinScore);
  setText('overview-metric-skin-score', skinScore);
  setText('overview-hydration', asPercent(hydration, 72));
  setText('overview-acne', acne);
  setText('overview-analysis-hydration', asPercent(hydration, 72));
  setText('overview-analysis-oil', asPercent(oilBalance, 68));
  setText('overview-analysis-acne', `${acne} low`);
  setText('overview-analysis-pigmentation', asPercent(pigmentation, 10));
  setText('overview-metric-product-matches', products.length || 0);
  setText('overview-metric-glow-streak', typeof glowStreak === 'number' ? `${glowStreak} days` : glowStreak);
  renderHeaderStreak(glowStreak);
  renderSkinAnalysisScene(scan);
  setText('product-matches-value', products.length || 0);
  setText('product-matches-metric-value', products.length || 0);
}

function renderSkinAnalysisScene(scan = {}) {
  const scene = document.querySelector('.analysis-scene');
  if (!scene) return;

  const photo = getLatestScanPhoto(scan);
  if (!photo) return;

  const zones = buildSkinZones(scan);
  scene.classList.add('analysis-scene--photo');
  scene.innerHTML = `
    <div class="skin-map-photo-wrap">
      <img class="skin-map-photo" src="${escapeHtml(photo)}" alt="Latest face scan analysis">
    </div>
    <div class="skin-map-callouts" aria-label="AI face zone notes">
      ${zones.map((zone) => `
        <article class="skin-map-callout skin-map-callout--${zone.key}">
          <span class="skin-map-dot"></span>
          <div>
            <strong>${escapeHtml(zone.label)}</strong>
            <p>${escapeHtml(zone.note)}</p>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function getLatestScanPhoto(scan = {}) {
  return (
    scan.image_data_url ||
    scan.photo_data_url ||
    scan.face_image ||
    scan.image_url ||
    scan.photo_url ||
    localStorage.getItem('glowth_latest_scan_photo') ||
    ''
  );
}

function buildSkinZones(scan = {}) {
  const zoneAnalysis = normalizeZoneAnalysis(scan.zone_analysis || scan.zones || scan.face_zones);
  const concerns = parseJsonArray(scan.visible_concerns || scan.concerns_detected || scan.concerns || []);
  const concernByZone = (zoneName) => {
    const match = concerns.find((item) => {
      const zone = cleanText(item.zone || item.area || '').toLowerCase();
      return zone.includes(zoneName);
    });
    return cleanText(match?.concern || match?.evidence || match?.severity || '');
  };

  const hydration = asPercent(metricValue(scan, ['hydration', 'hydration_score'], 72), 72);
  const oil = asPercent(metricValue(scan, ['oil_balance', 'oil', 'sebum_balance'], 68), 68);
  const acne = metricValue(scan, ['acne', 'active_acne', 'acne_score'], 2);
  const pigmentation = asPercent(metricValue(scan, ['pigmentation', 'pigmentation_score'], 10), 10);
  const texture = metricValue(scan, ['texture_score', 'texture', 'skin_texture'], 'Balanced');

  return [
    {
      key: 'forehead',
      label: 'Forehead',
      note: zoneAnalysis.forehead || concernByZone('forehead') || `Texture ${texture}`
    },
    {
      key: 'under-eye',
      label: 'Under-eye',
      note: zoneAnalysis.under_eye || concernByZone('under') || `Hydration ${hydration}`
    },
    {
      key: 'cheeks',
      label: 'Cheeks',
      note: zoneAnalysis.cheeks || zoneAnalysis.left_cheek || concernByZone('cheek') || `Pigmentation ${pigmentation}`
    },
    {
      key: 'nose',
      label: 'Nose / T-zone',
      note: zoneAnalysis.t_zone || zoneAnalysis.nose || concernByZone('t-zone') || `Oil balance ${oil}`
    },
    {
      key: 'chin',
      label: 'Chin / jawline',
      note: zoneAnalysis.chin_jaw || zoneAnalysis.chin || concernByZone('chin') || `Acne points ${acne}`
    }
  ];
}

function normalizeZoneAnalysis(value = {}) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (!value || typeof value !== 'object') return {};

  return Object.entries(value).reduce((acc, [key, val]) => {
    const note = typeof val === 'object' && val
      ? cleanText(val.observation || val.note || val.concern || val.evidence || val.summary || JSON.stringify(val))
      : cleanText(val);
    acc[key.toLowerCase().replace(/[\s-]/g, '_')] = note;
    return acc;
  }, {});
}

function renderHeaderStreak(glowStreak) {
  if (localStorage.getItem('glowth_streak_scan_dates') && typeof updateStreakProgress === 'function') {
    window.updateStreakProgress?.();
    return;
  }

  const rawValue = typeof glowStreak === 'number' ? `${glowStreak} days` : String(glowStreak || '7 days');
  const days = parseInt(rawValue, 10) || 7;
  localStorage.setItem('glowth_streak_days', String(days));

  setText('header-streak-count', days);
  setText('header-streak-days', `${days} days`);
  setText('header-streak-next', `${Math.max(days + 3, 10)} days`);
  setText('header-streak-today', days > 0 ? 'On track' : 'Start today');
  setText('header-streak-reward', days >= 7 ? 'Strong weekly rhythm' : 'Build weekly rhythm');
}

function ensureLiveDashboardStyles() {
  if (document.getElementById('glowth-live-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'glowth-live-dashboard-styles';
  style.textContent = `
    .product-stack {
      align-items: stretch;
    }

    #recommendation-products-grid,
    #recommendation-products-list {
      display: flex;
      gap: 14px;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-inline: contain;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: 4px;
      padding: 4px 4px 12px;
      -webkit-overflow-scrolling: touch;
      cursor: grab;
    }

    #recommendation-products-grid:active,
    #recommendation-products-list:active {
      cursor: grabbing;
    }

    #recommendation-products-grid::-webkit-scrollbar,
    #recommendation-products-list::-webkit-scrollbar {
      height: 8px;
    }

    #recommendation-products-grid::-webkit-scrollbar-thumb,
    #recommendation-products-list::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: #b9cde7;
    }

    #recommendation-products-grid .product-card--live,
    #recommendation-products-list .product-card--live {
      flex: 0 0 min(300px, 82vw);
      scroll-snap-align: start;
    }

    .product-card--live {
      min-width: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--border-soft);
      border-radius: 16px;
      background: #fff;
      display: grid;
      grid-template-rows: 138px minmax(0, 1fr);
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .product-card--live:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-hover);
      border-color: var(--border-strong);
    }

    .product-card--live:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 3px;
    }

    .product-image-frame {
      display: grid;
      place-items: center;
      background: linear-gradient(145deg, #f8fbff 0%, #eaf3ff 100%);
      border-bottom: 1px solid var(--border-soft);
    }

    .product-image-frame img {
      width: 100%;
      height: 138px;
      object-fit: contain;
      padding: 12px;
    }

    .product-card-body {
      min-width: 0;
      padding: 14px;
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .product-card-topline,
    .routine-step-topline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .product-type,
    .routine-tag,
    .match-pill {
      width: fit-content;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
    }

    .product-type {
      color: var(--brand-strong);
      background: #edf6ff;
      border: 1px solid #c9ddf5;
    }

    .routine-tag {
      color: #216338;
      background: #edf8f0;
      border: 1px solid #c8e8cf;
    }

    .match-pill {
      color: #fff;
      background: linear-gradient(135deg, #2f80ed 0%, #1d63c5 100%);
      border: 1px solid transparent;
    }

    .product-card--live h4 {
      margin: 0;
      color: var(--text-main);
      font-size: 0.98rem;
      line-height: 1.25;
      font-family: var(--font-body);
      font-weight: 800;
    }

    .product-card--live p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.82rem;
      line-height: 1.45;
    }

    .routine-step--compact {
      grid-template-columns: 42px minmax(0, 1fr);
    }

    .routine-step--detailed {
      align-items: start;
      grid-template-columns: 48px minmax(0, 1fr);
      padding: 16px;
    }

    .routine-step--detailed .routine-step__copy {
      display: grid;
      gap: 8px;
    }

    .routine-product-name {
      color: var(--text-main);
      font-weight: 800;
      font-size: 0.92rem;
    }

    .routine-step-note {
      color: var(--text-muted);
      font-size: 0.88rem;
      line-height: 1.5;
    }

    .routine-section-label {
      margin-top: 8px;
      color: var(--text-soft);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .routine-step--compact .routine-step__copy p {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .progress-ring {
      background: conic-gradient(#6bcf7f 0 var(--ring-fill, 72%), #e6eef8 var(--ring-fill, 72%) 100%);
    }

    @media (max-width: 760px) {
      #recommendation-products-grid .product-card--live,
      #recommendation-products-list .product-card--live {
        flex-basis: min(100%, calc(100vw - 72px));
        min-width: min(100%, calc(100vw - 72px));
      }

      .product-card--live {
        grid-template-columns: 112px minmax(0, 1fr);
        grid-template-rows: none;
      }

      .product-image-frame img {
        height: 128px;
      }
    }
  `;

  document.head.appendChild(style);
}

function getRoutineContext() {
  const hour = new Date().getHours();
  return hour >= 17 || hour < 4 ? 'Evening' : 'Morning';
}

function groupProductsByTime(products = []) {
  const normalized = normalizeProducts(products);
  const morning = normalized.filter((item) => item.routine_time === 'Morning');
  const evening = normalized.filter((item) => item.routine_time === 'Evening');
  const currentTime = getRoutineContext();
  const current = currentTime === 'Morning' ? morning : evening;
  const later = currentTime === 'Morning' ? evening : morning;

  return {
    currentTime,
    morning,
    evening,
    current,
    later,
    ordered: [...current, ...later]
  };
}

function renderProductSections(products = []) {
  ensureLiveDashboardStyles();

  const liveProducts = products.length ? products : normalizeProducts(window.GLOWTH_PRODUCTS || []);
  const grouped = groupProductsByTime(liveProducts);
  const currentProducts = grouped.current.length ? grouped.current : grouped.ordered;

  renderProductCards('overview-products', currentProducts.slice(0, 3));
  renderProductCards('recommendation-products-grid', currentProducts.slice(0, 3));
  renderProductCards('recommendation-products-list', grouped.ordered);

  setText('product-matches-value', liveProducts.length || 0);
  setText('product-matches-metric-value', liveProducts.length || 0);
  setText('overview-metric-product-matches', liveProducts.length || 0);
  setText('hero-badge-matched-products', `${grouped.currentTime} products`);
}

function renderRecommendationProducts(data = {}) {
  const products = normalizeProducts(data.products || window.GLOWTH_PRODUCTS || []);

  if (products.length) {
    renderProductSections(products);
    return;
  }

  const rec = normalizeRecommendationRecord(data.recommendation || window.GLOWTH_RECOMMENDATION || {});
  const fallbackProducts = [
    ...rec.morning_routine.map((item) => ({ ...item, routine_time: 'Morning' })),
    ...rec.evening_routine.map((item) => ({ ...item, routine_time: 'Evening' }))
  ];

  renderProductSections(normalizeProducts(fallbackProducts));
}

function renderProductCards(containerId, products = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const cards = products.slice(0, containerId === 'recommendation-products-list' ? 8 : 3);

  if (!cards.length) return;

  container.innerHTML = '';

  cards.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card product-card--live';
    card.tabIndex = 0;
    card.setAttribute('role', product.product_url ? 'link' : 'article');

    if (product.product_url) {
      card.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(product.product_url, '_blank', 'noopener,noreferrer');
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.open(product.product_url, '_blank', 'noopener,noreferrer');
        }
      });
    }

    card.innerHTML = `
      <div class="product-image-frame">
        <img src="${escapeHtml(product.image_url || '../assests/logo.png')}" alt="${escapeHtml(product.product_name)}" loading="lazy">
      </div>
      <div class="product-card-body">
        <div class="product-card-topline">
          <span class="product-type">${escapeHtml(product.product_type)}</span>
          <span class="routine-tag">${escapeHtml(product.routine_time)}</span>
        </div>
        <h4>${escapeHtml(shorten(product.product_name, 58))}</h4>
        <div class="product-card-topline">
          <span class="match-pill">${escapeHtml(product.match_score)}% match</span>
        </div>
        <p>${escapeHtml(cleanSentence(product.why_it_helps, 96))}</p>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderIngredients(data = {}) {
  const container = document.getElementById('ingredient-list');
  if (!container) return;

  const rec = normalizeRecommendationRecord(data.recommendation || window.GLOWTH_RECOMMENDATION || {});
  const keyIngredients = rec.key_ingredients.slice(0, 3);
  const avoidIngredients = rec.avoid_ingredients.slice(0, 3);

  if (!keyIngredients.length && !avoidIngredients.length) return;

  container.innerHTML = '';

  keyIngredients.forEach((item) => {
    container.innerHTML += `
      <li>
        <span>${escapeHtml(ingredientText(item))}</span>
        <strong><span class="scan-value">Keep</span></strong>
      </li>
    `;
  });

  avoidIngredients.forEach((item) => {
    container.innerHTML += `
      <li>
        <span>${escapeHtml(ingredientText(item))}</span>
        <strong><span class="scan-value">Avoid</span></strong>
      </li>
    `;
  });

  setText('ingredient-checks-value', keyIngredients.length + avoidIngredients.length);
  setText('ingredient-checks-metric-value', keyIngredients.length + avoidIngredients.length);
}

function ingredientText(item) {
  if (typeof item === 'object' && item !== null) {
    return cleanText(item.name || item.ingredient || item.title || JSON.stringify(item));
  }

  return cleanText(item);
}

function renderRecommendationSupport(rec = {}, products = []) {
  renderLifestyleCard(rec);
  renderSavedMatches(products);
}

function renderLifestyleCard(rec = {}) {
  const lifestyleCard = document.getElementById('lifestyle-card');
  if (!lifestyleCard) return;

  const tips = parseJsonArray(rec.tips).map((item) => {
    if (typeof item === 'object' && item !== null) return cleanText(item.title || item.tip || item.text || JSON.stringify(item));
    return cleanText(item);
  }).filter(Boolean);

  const fallbackTips = [
    'Use SPF generously in daylight',
    'Keep the routine light in humid weather',
    'Prioritize barrier support if skin feels tight'
  ];

  const finalTips = (tips.length ? tips : fallbackTips).slice(0, 3);
  const chips = document.getElementById('recommendation-lifestyle-chips');
  const list = lifestyleCard.querySelector('.card-list');

  if (chips) {
    chips.innerHTML = finalTips.map((tip) => `<span class="display-chip display-chip--live">${escapeHtml(shorten(tip, 24))}</span>`).join('');
  }

  if (list) {
    list.innerHTML = finalTips.map((tip, index) => `
      <li class="insight-row">
        <span>${index === 0 ? 'Today' : index === 1 ? 'Climate' : 'Habit'}</span>
        <strong><span class="scan-value">${escapeHtml(shorten(tip, 42))}</span></strong>
      </li>
    `).join('');
  }
}

function renderSavedMatches(products = []) {
  const savedCard = document.getElementById('saved-card');
  if (!savedCard) return;

  const list = savedCard.querySelector('.card-list');
  if (!list) return;

  const saved = normalizeProducts(products).slice(0, 4);
  if (!saved.length) return;

  list.innerHTML = saved.map((product) => `
    <li class="saved-match-row">
      <span>${escapeHtml(shorten(product.product_name, 34))}</span>
      <strong><span class="scan-value">${escapeHtml(product.match_score)}% match</span></strong>
    </li>
  `).join('');
}

function buildRoutineSteps(products = [], rec = {}) {
  const productSteps = normalizeProducts(products);

  if (productSteps.length) {
    const grouped = groupProductsByTime(productSteps);
    let morning = grouped.morning;
    let evening = grouped.evening;

    if (!morning.length && productSteps.length) morning = productSteps.slice(0, 2);
    if (!evening.length && productSteps.length > 2) evening = productSteps.slice(2, 4).map((item) => ({ ...item, routine_time: 'Evening' }));

    return {
      morning: pickMorningEssentials(morning, productSteps),
      evening: evening.slice(0, 2)
    };
  }

  const recommendation = normalizeRecommendationRecord(rec);
  const morningFallback = normalizeProducts(recommendation.morning_routine.map((item) => ({ ...item, routine_time: 'Morning' })));
  return {
    morning: pickMorningEssentials(morningFallback, morningFallback),
    evening: normalizeProducts(recommendation.evening_routine.map((item) => ({ ...item, routine_time: 'Evening' }))).slice(0, 2)
  };
}

function pickMorningEssentials(morning = [], allProducts = []) {
  const pool = morning.length ? morning : allProducts;
  const cleanser = pool.find((item) => productRole(item) === 'cleanser') || pool[0];
  const treatment =
    pool.find((item) => productRole(item) === 'treatment' && item !== cleanser) ||
    pool.find((item) => item !== cleanser) ||
    cleanser;

  return [
    withRoutineType(cleanser || {}, 'Cleanser'),
    withRoutineType(treatment || {}, 'Treatment')
  ].filter((item) => item.product_name || item.product_type);
}

function renderRoutine(rec = {}) {
  renderRoutineFromProducts(window.GLOWTH_PRODUCTS || [], rec);
}

function renderRoutineFromProducts(products = [], rec = {}) {
  ensureLiveDashboardStyles();

  const steps = buildRoutineSteps(products, rec);
  const allSteps = [...steps.morning, ...steps.evening];
  const adherence = calculateAdherence(allSteps);

  renderRoutinePreview('overview-routine-list', steps);
  renderRoutinePreview('routine-morning', steps);
  renderRoutineRail('routine-morning-list', steps.morning, { detailed: true });
  renderEveningList('routine-evening-steps', steps.evening);
  renderRoutineLogic(steps, adherence);
  updateRoutineProof(steps, adherence);
  wireRoutineCompletion();

  const total = steps.morning.length + steps.evening.length;
  setText('routine-morning-readiness', steps.morning.length ? '92%' : '0%');
  setText('routine-evening-readiness', steps.evening.length ? '78%' : '0%');
  setText('routine-adherence', `${adherence}%`);
  setMetricCardValue('Morning steps', steps.morning.length || 2);
  setMetricCardValue('Evening steps', steps.evening.length || 2);
  setMetricCardValue('Adherence', `${adherence}%`);
  setMetricCardValue('Active steps', total || 4);
  document.querySelectorAll('.metric-card .scan-value').forEach((node) => {
    if (node.textContent === '5' && total) node.textContent = total;
    if (node.textContent === '88%') node.textContent = `${adherence}%`;
  });
}

function setMetricCardValue(label, value) {
  document.querySelectorAll('.metric-card').forEach((card) => {
    const labelNode = card.querySelector('.metric-label');
    const valueNode = card.querySelector('.metric-value .scan-value');
    if (labelNode && valueNode && labelNode.textContent.trim() === label) {
      valueNode.textContent = value;
    }
  });
}

function wireRoutineCompletion() {
  document.querySelectorAll('.step-complete-btn').forEach((button) => {
    if (button.dataset.liveRoutineWired === 'true') return;
    button.dataset.liveRoutineWired = 'true';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      const steps = Array.from(document.querySelectorAll('#routine-morning-list .routine-step'));
      const nextStep = steps.find((step) => !step.classList.contains('routine-step--complete')) || steps[0];

      if (nextStep) {
        nextStep.classList.add('routine-step--complete');
      }

      button.classList.add('is-complete');
      button.textContent = '✓ Step completed';
    });
  });
}

function calculateAdherence(steps = []) {
  if (!steps.length) return 0;

  const averageMatch = steps.reduce((sum, step) => sum + Number(step.match_score || 86), 0) / steps.length;
  const simplicityBonus = steps.length <= 4 ? 4 : 0;
  const balanceBonus = steps.some((step) => step.routine_time === 'Morning') && steps.some((step) => step.routine_time === 'Evening') ? 3 : 0;

  return Math.max(62, Math.min(98, Math.round(averageMatch + simplicityBonus + balanceBonus - 5)));
}

function updateRoutineProof(steps = {}, adherence = 0) {
  const total = (steps.morning?.length || 0) + (steps.evening?.length || 0);
  const completed = Math.min(2, total);
  const nextStep = [...(steps.morning || []), ...(steps.evening || [])][completed] || steps.morning?.[0] || steps.evening?.[0];

  const proof = document.querySelector('.routine-proof');
  if (proof) {
    const count = proof.querySelector('strong');
    const fill = proof.querySelector('.routine-proof-track span');
    const copy = proof.querySelector('p');

    if (count) count.textContent = `${completed} of ${total || 4}`;
    if (fill) fill.style.setProperty('--fill', `${total ? Math.round((completed / total) * 100) : 0}%`);
    if (copy && nextStep) copy.textContent = `Next: ${nextStep.product_type}, ${shorten(nextStep.why_it_helps, 44)}`;
  }

  document.querySelectorAll('.progress-ring').forEach((ring) => {
    ring.style.setProperty('--ring-fill', `${adherence}%`);
    const strong = ring.querySelector('strong .scan-value, strong');
    if (strong && strong.textContent.trim() === '88') strong.textContent = adherence;
  });
}

function renderRoutinePreview(containerId, groupedSteps = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  [
    { label: 'Morning', steps: groupedSteps.morning || [] },
    { label: 'Evening', steps: groupedSteps.evening || [] }
  ].forEach((section) => {
    section.steps.slice(0, 2).forEach((step, index) => {
      const node = createRoutineStepNode(step, index, { detailed: false });
      container.appendChild(node);
    });
  });
}

function renderRoutineRail(containerId, steps = [], options = {}) {
  const container = document.getElementById(containerId);
  if (!container || !steps.length) return;

  container.innerHTML = '';

  steps.slice(0, 2).forEach((step, index) => {
    container.appendChild(createRoutineStepNode(step, index, options));
  });
}

function createRoutineStepNode(step, index, options = {}) {
  const node = document.createElement('div');
  node.className = `routine-step routine-step--compact${options.detailed ? ' routine-step--detailed' : ''}`;
  const description = step.why_it_helps || step.product_name;

  node.innerHTML = `
    <div class="routine-step__index">${String(index + 1).padStart(2, '0')}</div>
    <div class="routine-step__copy">
      <div class="routine-step-topline">
        <h4>${escapeHtml(shorten(step.product_type || step.product_name, options.detailed ? 44 : 34))}</h4>
        <span class="routine-tag">${escapeHtml(step.routine_time)}</span>
      </div>
      ${options.detailed ? `<div class="routine-product-name">${escapeHtml(shorten(step.product_name, 74))}</div>` : ''}
      <p class="${options.detailed ? 'routine-step-note' : ''}">${escapeHtml(shorten(description, options.detailed ? 150 : 92))}</p>
      ${options.detailed ? `<span class="match-pill">${escapeHtml(step.match_score)}% match</span>` : ''}
    </div>
  `;

  return node;
}

function renderEveningList(containerId, steps = []) {
  const container = document.getElementById(containerId);
  if (!container || !steps.length) return;

  container.innerHTML = '';

  steps.slice(0, 2).forEach((step) => {
    const index = steps.indexOf(step);
    container.innerHTML += `
      <li>
        <span>${String(index + 1).padStart(2, '0')} ${escapeHtml(shorten(step.product_type, 18))}</span>
        <strong><span class="scan-value">${escapeHtml(shorten(step.why_it_helps || step.product_name, 42))}</span></strong>
      </li>
    `;
  });
}

function renderRoutineLogic(steps = {}, adherence = 0) {
  const logic = document.getElementById('routine-logic-steps');
  if (!logic) return;

  const total = (steps.morning?.length || 0) + (steps.evening?.length || 0);
  logic.innerHTML = `
    <li><span>AM focus</span><strong><span class="scan-value">${steps.morning?.[0]?.product_type || 'Protect'}</span></strong></li>
    <li><span>PM focus</span><strong><span class="scan-value">${steps.evening?.[0]?.product_type || 'Repair'}</span></strong></li>
    <li><span>Adherence</span><strong><span class="scan-value">${adherence}%</span></strong></li>
    <li><span>Plan size</span><strong><span class="scan-value">${total || 4} clear steps</span></strong></li>
  `;
}


// Add Setting Logic
/* ================================
   GLOWTH SETTINGS SYSTEM
================================ */

document.addEventListener(
  'DOMContentLoaded',
  initializeGlowthSettings
);

document.addEventListener(
  'glowth:page-swapped',
  initializeGlowthSettings
);

function initializeGlowthSettings() {

  initializeToggles();

  initializeDarkMode();

  initializePersonalityCards();

  initializeSelects();

  initializeReminderPreferences();

}


/* ================================
   TOGGLES
================================ */

function initializeToggles() {

  document
    .querySelectorAll('.ios-toggle')
    .forEach(toggle => {

      if (
        toggle.dataset.initialized === 'true'
      ) return;

      toggle.dataset.initialized = 'true';

      toggle.addEventListener(
        'click',
        () => {

          toggle.classList.toggle('active');

          saveToggleState(toggle);

          if (isReminderSetting(toggle.dataset.setting)) {
            syncReminderPreferences({
              requestPush: toggle.classList.contains('active')
            });
          }

          if (
            toggle.dataset.setting ===
            'dark-mode'
          ) {

            applyDarkMode(
              toggle.classList.contains(
                'active'
              )
            );

          }

        }
      );

      restoreToggleState(toggle);

    });

}


function saveToggleState(toggle) {

  const key =
    toggle.dataset.setting;

  if (!key) return;

  localStorage.setItem(
    `glowth-setting-${key}`,
    toggle.classList.contains('active')
  );

}


function restoreToggleState(toggle) {

  const key =
    toggle.dataset.setting;

  if (!key) return;

  const saved =
    localStorage.getItem(
      `glowth-setting-${key}`
    );

  if (saved === 'true') {
    toggle.classList.add('active');
  } else if (saved === 'false') {
    toggle.classList.remove('active');
  }

}



/* ================================
   DARK MODE
================================ */

function initializeDarkMode() {

  const enabled =
    localStorage.getItem(
      'glowth-dark-mode'
    ) === 'true';

  applyDarkMode(enabled);

}


function applyDarkMode(enabled) {

  document.body.classList.toggle(
    'glowth-dark',
    enabled
  );

  localStorage.setItem(
    'glowth-dark-mode',
    enabled
  );

}



/* ================================
   AI PERSONALITY
================================ */

function initializePersonalityCards() {

  const cards =
    document.querySelectorAll(
      '.personality-card'
    );

  cards.forEach(card => {

    card.addEventListener(
      'click',
      () => {

        cards.forEach(c =>
          c.classList.remove('active')
        );

        card.classList.add('active');

        localStorage.setItem(
          'glowth-ai-personality',
          card.dataset.personality
        );

      }
    );

  });

  const saved =
    localStorage.getItem(
      'glowth-ai-personality'
    );

  if (saved) {

    const activeCard =
      document.querySelector(
        `.personality-card[data-personality="${saved}"]`
      );

    if (activeCard) {

      cards.forEach(c =>
        c.classList.remove('active')
      );

      activeCard.classList.add('active');

    }

  }

}



/* ================================
   SELECTS
================================ */

function initializeSelects() {

  document
    .querySelectorAll('.settings-select')
    .forEach(select => {

      const key =
        select.dataset.setting;

      if (!key) return;

      const saved =
        localStorage.getItem(
          `glowth-select-${key}`
        );

      if (saved) {
        select.value = saved;
      }

      select.addEventListener(
        'change',
        () => {

          localStorage.setItem(
            `glowth-select-${key}`,
            select.value
          );

        }
      );

    });

}




/* ================================
   REMINDER NOTIFICATIONS
================================ */

function isReminderSetting(key = '') {
  return ['morning-reminders', 'evening-reminders', 'weekly-scan'].includes(key);
}

function initializeReminderPreferences() {
  const reminderControls = document.querySelectorAll('[data-reminder-time]');
  const reminderToggles = document.querySelectorAll('[data-setting="morning-reminders"], [data-setting="evening-reminders"], [data-setting="weekly-scan"]');

  if (!reminderControls.length && !reminderToggles.length) return;

  reminderControls.forEach((control) => {
    if (control.dataset.reminderInitialized === 'true') return;
    control.dataset.reminderInitialized = 'true';

    const saved = localStorage.getItem(`glowth-reminder-${control.dataset.reminderTime}-time`);
    if (saved) control.value = saved;

    control.addEventListener('change', () => {
      localStorage.setItem(`glowth-reminder-${control.dataset.reminderTime}-time`, control.value);
      syncReminderPreferences();
    });
  });

  loadReminderPreferences();
}

async function loadReminderPreferences() {
  const userId = localStorage.getItem('glowth_user_id');
  if (!userId || typeof supabaseClient === 'undefined') return;

  try {
    const { data, error } = await supabaseClient
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Glowth] notification preferences:', error);
      return;
    }

    if (!data) {
      await syncReminderPreferences();
      return;
    }

    setReminderToggle('morning-reminders', data.morning_enabled);
    setReminderToggle('evening-reminders', data.evening_enabled);
    setReminderToggle('weekly-scan', data.weekly_scan_enabled);
    setReminderTime('morning', data.morning_time || '08:00:00');
    setReminderTime('evening', data.evening_time || '21:00:00');
    setReminderStatus('Reminder preferences synced. Notification permission browser se allow karna hoga.');
  } catch (error) {
    console.warn('[Glowth] reminder preference load failed:', error);
  }
}

function setReminderToggle(key, enabled) {
  const toggle = document.querySelector(`[data-setting="${key}"]`);
  if (!toggle || enabled === undefined || enabled === null) return;

  toggle.classList.toggle('active', enabled === true);
  localStorage.setItem(`glowth-setting-${key}`, String(enabled === true));
}

function setReminderTime(type, value) {
  const control = document.querySelector(`[data-reminder-time="${type}"]`);
  if (!control || !value) return;

  control.value = value;
  localStorage.setItem(`glowth-reminder-${type}-time`, value);
}

async function syncReminderPreferences(options = {}) {
  const userId = localStorage.getItem('glowth_user_id');
  if (!userId || typeof supabaseClient === 'undefined') {
    setReminderStatus('Login ke baad reminders cloud me save honge.');
    return;
  }

  const morningEnabled = document.querySelector('[data-setting="morning-reminders"]')?.classList.contains('active') || false;
  const eveningEnabled = document.querySelector('[data-setting="evening-reminders"]')?.classList.contains('active') || false;
  const weeklyScanEnabled = document.querySelector('[data-setting="weekly-scan"]')?.classList.contains('active') || false;
  const morningTime = document.querySelector('[data-reminder-time="morning"]')?.value || '08:00:00';
  const eveningTime = document.querySelector('[data-reminder-time="evening"]')?.value || '21:00:00';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  localStorage.setItem('glowth-reminder-morning-time', morningTime);
  localStorage.setItem('glowth-reminder-evening-time', eveningTime);

  try {
    const { error } = await supabaseClient
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        morning_enabled: morningEnabled,
        evening_enabled: eveningEnabled,
        weekly_scan_enabled: weeklyScanEnabled,
        morning_time: morningTime,
        evening_time: eveningTime,
        timezone,
        tone: 'hinglish-witty',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;

    if (options.requestPush && (morningEnabled || eveningEnabled || weeklyScanEnabled)) {
      await ensureGlowthPushSubscription(userId);
    } else {
      setReminderStatus('Reminder preferences saved. Glowth ping karega, boring email nahi.');
    }
  } catch (error) {
    console.warn('[Glowth] reminder preference save failed:', error);
    setReminderStatus('Reminder save nahi hua. Supabase table/RLS check karo.');
  }
}

async function ensureGlowthPushSubscription(userId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    setReminderStatus('Ye browser push notifications support nahi karta.');
    return null;
  }

  const publicKey = typeof GLOWTH !== 'undefined' ? GLOWTH.VAPID_PUBLIC_KEY || '' : '';
  if (!publicKey || publicKey.includes('REPLACE_WITH')) {
    setReminderStatus('VAPID public key config.js me add karo, phir push notifications live hongi.');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    setReminderStatus('Notifications blocked hain. Browser permission allow karni padegi.');
    return null;
  }

  const registration = await navigator.serviceWorker.register('../sw.js');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  const raw = subscription.toJSON();
  const { error } = await supabaseClient
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: raw.endpoint,
      p256dh: raw.keys?.p256dh || '',
      auth: raw.keys?.auth || '',
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });

  if (error) throw error;

  setReminderStatus('Notifications on. Glowth ab routine time pe witty ping bhejega.');
  return subscription;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function setReminderStatus(message) {
  const status = document.getElementById('reminder-status');
  if (status && message) status.textContent = message;
}/* =========================================
   STREAK SYSTEM
========================================= */

const GLOWTH_STREAK_TARGETS = {
  10: [1, 4],
  15: [1, 3, 5, 0],
  20: [1, 2, 3, 4, 5],
  30: [0, 1, 2, 3, 4, 5, 6]
};

document.addEventListener('glowth:layout-ready', () => {
  window.initializeStreakSystem?.();
});
document.addEventListener('glowth:page-swapped', () => {
  window.initializeStreakSystem?.();
});
document.addEventListener('DOMContentLoaded', () => {
  window.initializeStreakSystem?.();
});

window.initializeStreakSystem = function initializeStreakSystem() {
  const widget = document.getElementById('streakWidget');
  if (!widget) return;

  const targetButtons = [...widget.querySelectorAll('.streak-target')];
  const dayButtons = [...widget.querySelectorAll('.streak-day')];
  if (!targetButtons.length || !dayButtons.length) return;

  if (!localStorage.getItem('glowth_streak_goal')) {
    localStorage.setItem('glowth_streak_goal', '10');
  }

  if (!localStorage.getItem('glowth_streak_schedule')) {
    saveStreakSchedule(getDefaultStreakSchedule(getStreakGoal()));
  }

  dayButtons.forEach((button, index) => {
    button.type = 'button';
    button.dataset.weekDay = String(index === 6 ? 0 : index + 1);

    if (button.dataset.streakInitialized === 'true') return;
    button.dataset.streakInitialized = 'true';
    button.addEventListener('click', () => {
      const schedule = getSavedStreakSchedule();
      const day = Number(button.dataset.weekDay);
      const nextSchedule = schedule.includes(day)
        ? schedule.filter((item) => item !== day)
        : [...schedule, day].sort((a, b) => a - b);

      saveStreakSchedule(nextSchedule);
      window.updateStreakProgress?.();
    });
  });

  targetButtons.forEach((button) => {
    if (button.dataset.streakInitialized === 'true') return;
    button.dataset.streakInitialized = 'true';
    button.addEventListener('click', () => {
      const target = Number(button.dataset.streakTarget);
      if (!target) return;

      localStorage.setItem('glowth_streak_goal', String(target));
      saveStreakSchedule(getDefaultStreakSchedule(target));
      window.updateStreakProgress?.();
    });
  });

  window.updateStreakProgress?.();
};

window.updateStreakProgress = function updateStreakProgress() {
  const widget = document.getElementById('streakWidget');
  if (!widget) return;

  const goal = getStreakGoal();
  const schedule = getSavedStreakSchedule();
  const scanDates = getStreakScanDates();
  const monthScans = scanDates.filter(isDateInCurrentMonth);
  const weeklyScans = scanDates.filter(isDateInCurrentWeek);
  const weeklyTarget = schedule.length || 1;
  const weeklyCompleted = Math.min(weeklyScans.length, weeklyTarget);
  const streakDays = countCompletedScanDays(scanDates);

  localStorage.setItem('glowth_streak_days', String(streakDays));

  document.querySelectorAll('.streak-target').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.streakTarget) === goal);
  });

  document.querySelectorAll('.streak-day').forEach((button) => {
    const day = Number(button.dataset.weekDay);
    const isSelected = schedule.includes(day);
    const isCompleted = weeklyScans.some((date) => date.getDay() === day);

    button.classList.toggle('active', isSelected);
    button.classList.toggle('completed', isCompleted);
    button.setAttribute('aria-pressed', String(isSelected));
    button.title = `${dayName(day)}${isCompleted ? ' scan completed' : ''}`;
  });

  const percent = Math.round((weeklyCompleted / weeklyTarget) * 100);
  const fill = document.getElementById('streak-progress-fill');
  const text = document.getElementById('streak-progress-text');
  const motivation = document.getElementById('streak-motivation');

  if (fill) fill.style.width = `${Math.min(percent, 100)}%`;
  if (text) text.textContent = `${weeklyCompleted} / ${weeklyTarget} scans completed this week`;
  if (motivation) {
    const weeklyLeft = Math.max(weeklyTarget - weeklyCompleted, 0);
    const monthlyLeft = Math.max(goal - monthScans.length, 0);
    motivation.textContent = weeklyLeft
      ? `${weeklyLeft} more scans left this week`
      : monthlyLeft
        ? `Weekly goal complete. ${monthlyLeft} scans left this month`
        : 'Monthly target completed';
  }

  setText('header-streak-count', streakDays);
  setText('header-streak-days', `${streakDays} ${streakDays === 1 ? 'day' : 'days'}`);
};

function getStreakGoal() {
  const saved = Number(localStorage.getItem('glowth_streak_goal'));
  return [10, 15, 20, 30].includes(saved) ? saved : 10;
}

function getDefaultStreakSchedule(goal) {
  return [...(GLOWTH_STREAK_TARGETS[goal] || GLOWTH_STREAK_TARGETS[10])];
}

function getSavedStreakSchedule() {
  try {
    const saved = JSON.parse(localStorage.getItem('glowth_streak_schedule') || '[]');
    const schedule = saved.map(Number).filter((day) => day >= 0 && day <= 6);
    return [...new Set(schedule)];
  } catch {
    return getDefaultStreakSchedule(getStreakGoal());
  }
}

function saveStreakSchedule(schedule) {
  localStorage.setItem('glowth_streak_schedule', JSON.stringify([...new Set(schedule)].sort((a, b) => a - b)));
}

function getStreakScanDates() {
  try {
    const saved = JSON.parse(localStorage.getItem('glowth_streak_scan_dates') || '[]');
    return saved.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  } catch {
    return [];
  }
}

function isDateInCurrentMonth(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isDateInCurrentWeek(date) {
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function countCompletedScanDays(dates) {
  return new Set(dates.map((date) => streakDateKey(date))).size;
}

function streakDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function restoreStreakSystemAfterResponsiveChange() {
  if (!document.getElementById('streakWidget')) return;
  window.initializeStreakSystem?.();
  window.updateStreakProgress?.();
}

window.addEventListener('resize', restoreStreakSystemAfterResponsiveChange);
setTimeout(restoreStreakSystemAfterResponsiveChange, 0);

function dayName(day) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] || 'Day';
}
/* =========================================
   FIRST SCAN STREAK
========================================= */

function launchFireCelebration() {

  const fire =
    document.createElement('div');

  fire.className =
    'streak-fire-burst';

  fire.textContent = '🔥';

  document.body.appendChild(fire);

  setTimeout(() => {
    fire.remove();
  }, 900);

}
