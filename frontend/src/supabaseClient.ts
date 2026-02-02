import { createClient, type User, type AuthChangeEvent, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xedjenxobpxhuoqqteed.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true, // Habilita refresh automático do token
    persistSession: true, // Mantém sessão salva
    detectSessionInUrl: true,
  }
});

// Helper para autenticação
export const auth = {
  signInWithEmailAndPassword: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  onAuthStateChange: (callback: (user: User | null) => void) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        callback(session?.user || null);
      }
    );
    return subscription;
  },

  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },
};
