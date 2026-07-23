/**
 * Glowth Authentication
 * Handle login, logout, and auth state
 */

// Check if user is authenticated
function isAuthenticated() {
  return !!localStorage.getItem('auth_token') && isUuid(localStorage.getItem('glowth_user_id'));
}

// Get current user ID
function getCurrentUserId() {
  return localStorage.getItem('glowth_user_id');
}

// Resolve page-relative routes for both root pages and dashboard pages
function getAppPath(path) {
  return window.location.pathname.includes('/dashboard/') ? `../${path}` : `./${path}`;
}

function buildDisplayName(email) {
  const localPart = (email || '').trim().split('@')[0].trim();
  if (!localPart) {
    return 'Glowth User';
  }

  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSafeUserId(email) {
  return (email || 'demo-user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'demo-user';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function clearQuizData() {
  [
    'glowth_quiz_completed',
    'glowth_quiz_answers',
    'glowth_skin_type',
    'glowth_concern_focus',
    'glowth_primary_goal',
    'glowth_conditions',
    'glowth_lifestyle'
  ].forEach((key) => localStorage.removeItem(key));
}

function rememberUserIdentity({ email, userId, name }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const previousEmail = (localStorage.getItem('glowth_user_email') || '').trim().toLowerCase();

  if (previousEmail && normalizedEmail && previousEmail !== normalizedEmail) {
    clearQuizData();
  }

  localStorage.setItem('glowth_user_id', userId || buildSafeUserId(email));
  localStorage.setItem('glowth_user_name', name || buildDisplayName(email));
  localStorage.setItem('glowth_user_email', email || '');
}

async function findUserIdentityByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || typeof supabaseClient === 'undefined') return null;

  const lookups = [
    {
      table: 'profiles',
      select: 'user_id,email,name,onboarding_completed',
      idKey: 'user_id'
    },
    {
      table: 'users',
      select: 'id,email,name,onboarding_completed',
      idKey: 'id'
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
      console.warn(`[Glowth] ${lookup.table} login lookup failed:`, error);
      continue;
    }

    const userId = data?.[lookup.idKey];
    if (isUuid(userId)) {
      return {
        userId,
        email: data.email || normalizedEmail,
        name: data.name || buildDisplayName(normalizedEmail),
        onboardingCompleted: data.onboarding_completed === true
      };
    }
  }

  return null;
}

async function loginWithSupabase(email, password) {
  if (typeof supabaseClient === 'undefined' || !supabaseClient.auth?.signInWithPassword) {
    return { success: false, error: 'Login is not configured yet.' };
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const user = data?.user;
  const accessToken = data?.session?.access_token;

  if (!user?.id || !isUuid(user.id)) {
    return null;
  }

  localStorage.setItem('auth_token', accessToken || `supabase-${Date.now()}`);
  rememberUserIdentity({
    email: user.email || email,
    userId: user.id,
    name: user.user_metadata?.name || buildDisplayName(user.email || email)
  });

  const identity = await findUserIdentityByEmail(user.email || email);
  if (identity) {
    if (identity.email || identity.name) {
      rememberUserIdentity({
        email: user.email || identity.email,
        userId: user.id,
        name: identity.name || user.user_metadata?.name || buildDisplayName(user.email || email)
      });
    }
    localStorage.setItem('glowth_quiz_completed', 'true');
  }

  return { success: true };
}

async function loginWithStoredSupabaseProfile(email) {
  const identity = await findUserIdentityByEmail(email);
  if (!identity) return null;

  localStorage.setItem('auth_token', `local-${Date.now()}`);
  rememberUserIdentity({
    email: identity.email,
    userId: identity.userId,
    name: identity.name
  });

  localStorage.setItem('glowth_quiz_completed', 'true');

  return { success: true };
}

function hasCompletedQuiz() {
  return localStorage.getItem('glowth_quiz_completed') === 'true';
}

function getPostLoginPath() {
  return hasCompletedQuiz() ? 'dashboard/overview.html' : 'quiz.html';
}

function createDemoSession(email) {
  const userId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;

  clearQuizData();
  localStorage.setItem('auth_token', `onboarding-${Date.now()}`);
  rememberUserIdentity({
    email,
    userId,
    name: buildDisplayName(email)
  });

  return { success: true, onboardingRequired: true };
}

function getLoginEndpoint() {
  if (typeof API_BASE !== 'undefined' && API_BASE) {
    return `${API_BASE}/api/login`;
  }

  if (typeof GLOWTH !== 'undefined' && GLOWTH.BASE) {
    return `${GLOWTH.BASE}/login`;
  }

  return '/api/login';
}

// Login function
async function login(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Please enter your email and password.' };
  }

  try {
    const supabaseLogin = await loginWithSupabase(email, password);
    if (supabaseLogin?.success) {
      return supabaseLogin;
    }

    return {
      success: false,
      error: supabaseLogin?.error || 'Invalid email or password.'
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Login service unavailable. Please try again later.' };
  }
}

async function signup(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Please enter your email and password.' };
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  if (typeof supabaseClient === 'undefined' || !supabaseClient.auth?.signUp) {
    return { success: false, error: 'Signup is not configured yet.' };
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: buildDisplayName(email)
        }
      }
    });

    if (error) {
      const message = String(error.message || '').toLowerCase();

      if (message.includes('rate limit')) {
        return {
          success: false,
          error: 'Too many signup attempts right now. Please wait a few minutes, then try again. If this email already has an account, switch to Log in.'
        };
      }

      if (message.includes('already') || message.includes('registered')) {
        return {
          success: false,
          error: 'This email already has a Glowth account. Please switch to Log in.'
        };
      }

      return { success: false, error: error.message || 'Could not create your account.' };
    }

    const user = data?.user;
    const session = data?.session;

    if (!session) {
      return {
        success: false,
        error: 'Account created. Please check your email to confirm it, then log in.'
      };
    }

    if (!user?.id || !isUuid(user.id)) {
      return { success: false, error: 'Account created, but login session is not ready. Please log in again.' };
    }

    localStorage.setItem('auth_token', session.access_token || `supabase-${Date.now()}`);
    clearQuizData();
    rememberUserIdentity({
      email: user.email || email,
      userId: user.id,
      name: user.user_metadata?.name || buildDisplayName(user.email || email)
    });

    return { success: true };
  } catch (error) {
    console.error('Signup error:', error);
    return { success: false, error: 'Signup service unavailable. Please try again later.' };
  }
}
// Logout function
function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('glowth_user_id');
  localStorage.removeItem('glowth_user_name');
  localStorage.removeItem('glowth_user_email');
  window.location.replace(getAppPath('login.html'));
}

// Redirect to login if not authenticated (for dashboard pages)
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.replace(getAppPath('login.html'));
  }
}

// Redirect to dashboard if already authenticated (for login page)
function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.replace(getAppPath(getPostLoginPath()));
  }
}


document.addEventListener('DOMContentLoaded', () => {
  if (document.body?.classList.contains('dashboard-page')) {
    requireAuth();
  }

  if (document.getElementById('loginForm')) {
    redirectIfAuthenticated();
  }
});
// js/auth.js Ã¢â‚¬â€ add this
async function submitOnboarding(formData) {
  const res = await fetch(`${GLOWTH_CONFIG.N8N_BASE}/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: formData.email,
      name: formData.name,
      age: formData.age,              // number
      location: formData.location,    // "Ludhiana" (no "India" suffix Ã¢â‚¬â€ workflow adds it)
      skinType: formData.skinType,    // "oily"|"dry"|"combination"|"sensitive"|"normal"
      concerns: formData.concerns,    // array: ["acne","pigmentation"]
      goals: formData.goals,          // array: ["clearer skin","even tone"]
      conditions: [],
      lifestyle: {}
    })
  });
  const data = await res.json();
  // data.user_id Ã¢â€ â€™ save to localStorage
  localStorage.setItem('glowth_user_id', data.user_id);
  return data;
}





