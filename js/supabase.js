// js/supabase.js

const SUPABASE_URL =
  'https://mgcxzqtkdoszrajojqyl.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_3rwm0_jR81p_5WPcuNafrw_eaV5rUvn';

const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

console.log('Supabase connected');