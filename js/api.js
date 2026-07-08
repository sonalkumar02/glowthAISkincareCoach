const API = {

  async joinWaitlist(email) {
    try {
      const res = await fetch(GLOWTH.url('waitlist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'website' })
      });
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async submitOnboarding(formData) {
    try {
      const res = await fetch(GLOWTH.url('onboarding'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.user_id) {
        localStorage.setItem('glowth_user_id', data.user_id);
        localStorage.setItem('glowth_user_name', formData.name || '');
        localStorage.setItem('glowth_user_email', formData.email || '');
        localStorage.setItem('glowth_skin_type', formData.skinType || '');
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async generateRecommendations() {
    const userId = localStorage.getItem('glowth_user_id');
    if (!userId) return { success: false, error: 'No user ID' };
    try {
      const res = await fetch(GLOWTH.url('recommendations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async buildRoutine() {
    const userId = localStorage.getItem('glowth_user_id');
    if (!userId) return { success: false, error: 'No user ID' };
    try {
      const res = await fetch(GLOWTH.url('buildRoutine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async getDashboard() {
  const userId = localStorage.getItem('glowth_user_id');
  if (!userId) return null;

  const [profileRes, scanRes, productsRes, routineRes, progressRes, settingsRes] =
    await Promise.all([
      supabaseClient.from('profiles').select('*').eq('user_id', userId).single(),

      supabaseClient
        .from('skin_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseClient
        .from('recommendations')
        .select('*')
        .eq('user_id', userId)
        .order('match_score', { ascending: false }),

      supabaseClient
        .from('routine_steps')
        .select('*')
        .eq('user_id', userId)
        .order('step_order', { ascending: true }),

      supabaseClient
        .from('progress_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),

      supabaseClient
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    ]);

  if (profileRes.error) console.warn(profileRes.error);
  if (scanRes.error) console.warn(scanRes.error);
  if (productsRes.error) console.warn(productsRes.error);

  const routineSteps = routineRes.data || [];

  return {
    profile: profileRes.data || {},
    latestScan: scanRes.data || {},
    products: productsRes.data || [],
    routine: {
      morning: routineSteps.filter(step => step.routine_time === 'morning'),
      evening: routineSteps.filter(step => step.routine_time === 'evening')
    },
    progress: progressRes.data || [],
    settings: settingsRes.data || {}
  };
}


};