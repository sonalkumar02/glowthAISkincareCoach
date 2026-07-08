// js/config.js

const GLOWTH = {
  PROD_N8N: 'https://glowth.onrender.com',
  VAPID_PUBLIC_KEY: 'REPLACE_WITH_YOUR_WEB_PUSH_PUBLIC_KEY',

  get BASE() {
    return `${this.PROD_N8N}/webhook`;
  },

  ENDPOINTS: {
    onboarding: 'onboarding',
    recommendations: 'recommendations',
    buildRoutine: 'build-routine',
    getDashboard: 'get-dashboard',
    scanFace: 'recommendations',
  },

  url(endpoint) {
    return `${this.BASE}/${this.ENDPOINTS[endpoint]}`;
  }
};
