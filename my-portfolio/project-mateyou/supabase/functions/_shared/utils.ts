import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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

  // Use service role key to validate token
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid token');
  }

  return user;
};

// Auth helper - get optional user from JWT token (returns null if not authenticated)
export const getOptionalAuthUser = async (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  try {
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
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

// Email masking utility
export const maskEmail = (email: string | null): string => {
  if (!email) return '***@***.***';

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***@***.***';

  // Mask local part (e.g., example -> ex***e)
  const maskedLocal = localPart.length <= 2
    ? localPart[0] + '***'
    : localPart.substring(0, 2) + '***' + localPart[localPart.length - 1];

  // Mask domain (e.g., domain.com -> do***.com)
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map((part, idx) => {
    if (idx === domainParts.length - 1) return part; // Keep TLD (.com, .net, etc.)
    return part.length <= 2 ? part[0] + '***' : part.substring(0, 2) + '***';
  }).join('.');

  return `${maskedLocal}@${maskedDomain}`;
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

export interface ParsedFile {
  fieldName: string;
  filename: string;
  content: Uint8Array;
  mimetype: string;
  size: number;
}

export interface ParsedFormData {
  fields: Record<string, string>;
  files: ParsedFile[];
}

/**
 * Parse multipart/form-data from a Request
 */
export const parseMultipartFormData = async (req: Request): Promise<ParsedFormData> => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data');
  }

  const formData = await req.formData();
  const fields: Record<string, string> = {};
  const files: ParsedFile[] = [];

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      files.push({
        fieldName: key,
        filename: value.name,
        content: new Uint8Array(arrayBuffer),
        mimetype: value.type,
        size: arrayBuffer.byteLength
      });
    } else {
      fields[key] = value.toString();
    }
  }

  return { fields, files };
};