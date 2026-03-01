import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import type { ApiResponse } from './types.ts';

// Initialize Supabase client for server-side usage
export const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

// CORS headers for API responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Success response helper
export const successResponse = <T>(data: T, meta?: any): Response => {
  const response: ApiResponse<T> = { success: true, data };
  if (meta) response.meta = meta;

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
};

// Error response helper
export const errorResponse = (
  code: string,
  message: string,
  details?: any,
  status: number = 400
): Response => {
  const response: ApiResponse = {
    success: false,
    error: { code, message, details }
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
};

// Auth helper - get user from JWT token
export const getAuthUser = async (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('No authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  // Use anon key for token validation instead of service key
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Invalid token');
  }

  return user;
};

// Name masking utility
export const maskName = (name: string | null): string => {
  if (!name) return '익명***';

  if (name.length <= 2) {
    return name[0] + '*'.repeat(Math.max(1, name.length - 1));
  } else {
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  }
};

// Validate request method
export const validateMethod = (request: Request, allowedMethods: string[]): boolean => {
  return allowedMethods.includes(request.method);
};

// Parse request body safely
export const parseRequestBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

// Get query parameters
export const getQueryParams = (url: string) => {
  const searchParams = new URL(url).searchParams;
  const params: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  return params;
};