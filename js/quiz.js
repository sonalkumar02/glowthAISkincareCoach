(function () {
  const questions = [
    {
      key: 'skinType',
      title: 'Skin Type',
      kicker: 'Skin profile',
      prompt: 'Choose the option that feels closest. You can safely choose "I don\'t know" if you are unsure.',
      options: [
        { label: 'Oily skin', detail: 'Shiny or greasy often, especially T-zone.' },
        { label: 'Dry skin', detail: 'Feels tight, rough, or flaky.' },
        { label: 'Combination skin', detail: 'Oily in some areas and dry in others.' },
        { label: 'Normal skin', detail: 'Mostly balanced and comfortable.' },
        { label: "I don't know", detail: 'Glowth will keep recommendations gentle.' }
      ]
    },
    {
      key: 'concern',
      title: 'Concern',
      kicker: 'Main focus',
      prompt: 'Pick the concern you most want Glowth to consider first.',
      options: [
        { label: 'Acne or breakouts', detail: 'Pimples, clogged pores, or bumps.' },
        { label: 'Dark spots or uneven tone', detail: 'Marks, tanning, or patchy tone.' },
        { label: 'Dryness or dehydration', detail: 'Tightness, dullness, or flaky areas.' },
        { label: 'Sensitivity or redness', detail: 'Skin gets irritated easily.' },
        { label: "I don't know", detail: 'A balanced routine is a good start.' }
      ]
    },
    {
      key: 'goals',
      title: 'Goals',
      kicker: 'Routine goal',
      prompt: 'Choose the result that would feel most useful for you right now.',
      options: [
        { label: 'Clearer skin', detail: 'Reduce breakouts and clogged pores.' },
        { label: 'Even skin tone', detail: 'Support brightness and reduce spots.' },
        { label: 'Stronger barrier', detail: 'Keep skin calm, hydrated, and resilient.' },
        { label: 'Simple daily routine', detail: 'Fewer steps, easy to follow.' },
        { label: "I don't know", detail: 'Glowth will start with safe basics.' }
      ]
    },
    {
      key: 'conditions',
      title: 'Conditions',
      kicker: 'Skin comfort',
      prompt: 'Select the option that best describes known skin comfort or conditions.',
      options: [
        { label: 'No known conditions', detail: 'No diagnosed or recurring skin issue.' },
        { label: 'Sensitive or reactive skin', detail: 'Burning, stinging, or irritation happens easily.' },
        { label: 'Eczema or dermatitis history', detail: 'Dry, itchy, inflamed patches at times.' },
        { label: 'Allergy-prone skin', detail: 'Products sometimes trigger reactions.' },
        { label: "I don't know", detail: 'Glowth will avoid aggressive suggestions.' }
      ]
    },
    {
      key: 'lifestyle',
      title: 'Lifestyle',
      kicker: 'Daily context',
      prompt: 'Pick the lifestyle factor that most affects your skin routine.',
      options: [
        { label: 'Mostly indoors', detail: 'Limited direct sun and outdoor pollution.' },
        { label: 'Regular sun exposure', detail: 'Commute, outdoor work, or sports.' },
        { label: 'Active or sweaty routine', detail: 'Gym, sports, or frequent sweating.' },
        { label: 'Late nights or stress', detail: 'Sleep and stress often affect skin.' },
        { label: "I don't know", detail: 'Glowth will keep the plan flexible.' }
      ]
    }
  ];

  const questionCard = document.getElementById('quizQuestionCard');
  const stepNode = document.getElementById('quizStep');
  const progressBar = document.getElementById('quizProgressBar');
  const kickerNode = document.getElementById('quizKicker');
  const titleNode = document.getElementById('quizTitle');
  const promptNode = document.getElementById('quizPrompt');
  const optionsNode = document.getElementById('quizOptions');
  const statusNode = document.getElementById('quizStatus');

  let currentIndex = 0;
  const answers = {};

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof requireAuth === 'function') {
      requireAuth();
    }

    if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
      return;
    }

    if (localStorage.getItem('glowth_quiz_completed') === 'true') {
      window.location.replace('./dashboard/overview.html');
      return;
    }

    renderQuestion();
  });

  function renderQuestion() {
    const question = questions[currentIndex];
    const step = currentIndex + 1;

    stepNode.textContent = `Question ${step} of ${questions.length}`;
    progressBar.style.width = `${(step / questions.length) * 100}%`;
    kickerNode.textContent = question.kicker;
    titleNode.textContent = question.title;
    promptNode.textContent = question.prompt;
    statusNode.textContent = '';
    statusNode.removeAttribute('data-state');

    optionsNode.innerHTML = question.options
      .map((option) => `
        <button class="quiz-option" type="button" data-value="${escapeAttribute(option.label)}">
          ${escapeHtml(option.label)}
          <span>${escapeHtml(option.detail)}</span>
        </button>
      `)
      .join('');

    questionCard.classList.remove('is-leaving');
    questionCard.style.animation = 'none';
    questionCard.offsetHeight;
    questionCard.style.animation = '';

    optionsNode.querySelectorAll('.quiz-option').forEach((button) => {
      button.addEventListener('click', () => handleAnswer(button));
    });
  }

  function handleAnswer(button) {
    const question = questions[currentIndex];
    const value = button.dataset.value;

    answers[question.key] = value;
    optionsNode.querySelectorAll('.quiz-option').forEach((option) => {
      option.disabled = true;
      option.classList.toggle('is-selected', option === button);
    });

    window.setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        questionCard.classList.add('is-leaving');
        window.setTimeout(() => {
          currentIndex += 1;
          renderQuestion();
        }, 190);
        return;
      }

      finishQuiz();
    }, 180);
  }

  async function finishQuiz() {
    statusNode.textContent = 'Saving your profile...';

    const profile = buildProfilePayload();
    saveProfileLocally(profile);

    const result = await saveProfileToSupabase(profile);
    if (!result.success) {
      console.warn('[Glowth] Quiz profile save fallback:', result.error);
    }

    localStorage.setItem('glowth_quiz_completed', 'true');
    statusNode.textContent = 'Saved. Opening your dashboard...';

    window.setTimeout(() => {
      window.location.replace('./dashboard/overview.html');
    }, 350);
  }

  function buildProfilePayload() {
    const userId = typeof getCurrentUserId === 'function'
      ? getCurrentUserId()
      : localStorage.getItem('glowth_user_id');

    const email = localStorage.getItem('glowth_user_email') || '';
    const name = localStorage.getItem('glowth_user_name') || 'Glowth User';
    const now = new Date().toISOString();

    return {
      user_id: userId,
      name,
      email,
      skin_type: answers.skinType,
      concern_focus: answers.concern,
      primary_goal: answers.goals,
      conditions: answers.conditions,
      lifestyle: answers.lifestyle,
      quiz_answers: answers,
      onboarding_completed: true,
      updated_at: now
    };
  }

  function saveProfileLocally(profile) {
    localStorage.setItem('glowth_user_name', profile.name || 'Glowth User');
    localStorage.setItem('glowth_user_email', profile.email || '');
    localStorage.setItem('glowth_skin_type', profile.skin_type || '');
    localStorage.setItem('glowth_concern_focus', profile.concern_focus || '');
    localStorage.setItem('glowth_primary_goal', profile.primary_goal || '');
    localStorage.setItem('glowth_conditions', profile.conditions || '');
    localStorage.setItem('glowth_lifestyle', profile.lifestyle || '');
    localStorage.setItem('glowth_quiz_answers', JSON.stringify(profile.quiz_answers || {}));
  }

  async function saveProfileToSupabase(profile) {
    if (!profile.user_id || typeof supabaseClient === 'undefined') {
      return { success: false, error: 'Supabase is not available on this page.' };
    }

    let lastError = null;
    let savedAnything = false;

    const userProfile = await supabaseClient
      .from('users')
      .upsert({
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        age: profile.age || null,
        location: profile.location || 'India'
      }, { onConflict: 'id' });

    if (!userProfile.error) {
      savedAnything = true;
    } else {
      lastError = userProfile.error;
    }

    const fullProfile = await supabaseClient
      .from('profiles')
      .upsert(profile, { onConflict: 'user_id' });

    if (!fullProfile.error) {
      return { success: true };
    }

    lastError = fullProfile.error;

    const minimalProfile = await supabaseClient
      .from('profiles')
      .upsert({
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        skin_type: profile.skin_type,
        updated_at: profile.updated_at
      }, { onConflict: 'user_id' });

    if (!minimalProfile.error) {
      savedAnything = true;
    } else {
      lastError = minimalProfile.error;
    }

    const settingsProfile = await supabaseClient
      .from('user_settings')
      .upsert({
        user_id: profile.user_id,
        onboarding_completed: true,
        quiz_answers: profile.quiz_answers,
        updated_at: profile.updated_at
      }, { onConflict: 'user_id' });

    if (!settingsProfile.error) {
      savedAnything = true;
    } else {
      lastError = settingsProfile.error;
    }

    return { success: savedAnything, error: savedAnything ? null : lastError };
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value = '') {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }
})();
