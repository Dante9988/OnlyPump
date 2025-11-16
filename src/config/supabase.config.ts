import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_KEY, // Use service role key for backend
  anonKey: process.env.SUPABASE_ANON_KEY, // Optional: for public operations
}));

