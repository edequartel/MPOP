// Public project settings, matching the editor. Never add a service-role key here.
const publicConfig = Object.freeze({
  url: "https://zrcdyzcfsdlmqqwdhctk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyY2R5emNmc2RsbXFxd2RoY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxOTgyNzUsImV4cCI6MjA4Mzc3NDI3NX0.voT1eh_FbBkrv7ZMN7B8VRRbrab7tyx3eV6JuXy4ySs"
});

export async function loadSupabaseClient(options = {}, importModule = (url) => import(url)) {
  let config = publicConfig;
  try {
    const module = await importModule("./supabase-config.js");
    config = module.supabaseConfig || module.default || publicConfig;
  } catch {
    // The optional local configuration is intentionally not tracked in Git.
  }
  if (!config?.url || !config?.anonKey) throw new Error("Supabase-configuratie is ongeldig.");
  const { createClient } = await importModule("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  return createClient(config.url, config.anonKey, options);
}
