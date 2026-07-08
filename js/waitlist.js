// js/waitlist.js (or inside existing form handler)
async function submitWaitlist(email) {
  const res = await fetch(`${GLOWTH.BASE}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source: 'website' })
  });
  const data = await res.json();
  // data.success = true → show "You're on the list!"
  return data;
}