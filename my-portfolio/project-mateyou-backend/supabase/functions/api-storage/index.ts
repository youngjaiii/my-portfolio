import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // POST /api-storage/upload - Upload file to storage
    if (pathname === '/api-storage/upload' && req.method === 'POST') {
      const user = await getAuthUser(req);

      // Parse multipart form data
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const bucket = formData.get('bucket') as string;
      const path = formData.get('path') as string;
      const upsert = formData.get('upsert') === 'true';

      if (!file) {
        return errorResponse('MISSING_FILE', 'File is required');
      }

      if (!bucket) {
        return errorResponse('MISSING_BUCKET', 'Bucket name is required');
      }

      if (!path) {
        return errorResponse('MISSING_PATH', 'File path is required');
      }

      // File size validation (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        return errorResponse('FILE_TOO_LARGE', 'File size exceeds 10MB limit');
      }

      // File type validation (images only)
      if (!file.type.startsWith('image/')) {
        return errorResponse('INVALID_FILE_TYPE', 'Only image files are allowed');
      }

      try {
        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: upsert,
          });

        if (uploadError) {
          return errorResponse('UPLOAD_FAILED', uploadError.message);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(uploadData.path);

        return successResponse({
          success: true,
          url: urlData.publicUrl,
          path: uploadData.path,
          size: file.size,
          type: file.type,
        });

      } catch (error) {
        return errorResponse('UPLOAD_ERROR', 'Failed to upload file', error.message);
      }
    }

    // DELETE /api-storage/delete - Delete file from storage
    if (pathname === '/api-storage/delete' && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.bucket || !body.path) {
        return errorResponse('INVALID_BODY', 'Bucket and path are required');
      }

      const { bucket, path } = body;

      try {
        const { error: deleteError } = await supabase.storage
          .from(bucket)
          .remove([path]);

        if (deleteError) {
          return errorResponse('DELETE_FAILED', deleteError.message);
        }

        return successResponse({
          success: true,
          message: 'File deleted successfully',
          path: path,
        });

      } catch (error) {
        return errorResponse('DELETE_ERROR', 'Failed to delete file', error.message);
      }
    }

    // GET /api-storage/url/{bucket}/{path} - Get public URL for file
    if (pathname.startsWith('/api-storage/url/') && req.method === 'GET') {
      const pathParts = pathname.split('/');
      const bucket = pathParts[3];
      const filePath = pathParts.slice(4).join('/');

      if (!bucket || !filePath) {
        return errorResponse('INVALID_PATH', 'Bucket and file path are required');
      }

      try {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        return successResponse({
          url: urlData.publicUrl,
          bucket: bucket,
          path: filePath,
        });

      } catch (error) {
        return errorResponse('URL_ERROR', 'Failed to get file URL', error.message);
      }
    }

    // GET /api-storage/info/{bucket}/{path} - Get file info
    if (pathname.startsWith('/api-storage/info/') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const pathParts = pathname.split('/');
      const bucket = pathParts[3];
      const filePath = pathParts.slice(4).join('/');

      if (!bucket || !filePath) {
        return errorResponse('INVALID_PATH', 'Bucket and file path are required');
      }

      try {
        const { data: fileInfo, error: infoError } = await supabase.storage
          .from(bucket)
          .list(filePath.split('/').slice(0, -1).join('/'), {
            search: filePath.split('/').pop()
          });

        if (infoError) {
          return errorResponse('INFO_FAILED', infoError.message);
        }

        const file = fileInfo?.[0];
        if (!file) {
          return errorResponse('FILE_NOT_FOUND', 'File not found');
        }

        return successResponse({
          name: file.name,
          size: file.metadata?.size,
          lastModified: file.updated_at,
          contentType: file.metadata?.mimetype,
          bucket: bucket,
          path: filePath,
        });

      } catch (error) {
        return errorResponse('INFO_ERROR', 'Failed to get file info', error.message);
      }
    }

    // POST /api-storage/generate-path - Generate unique file path
    if (pathname === '/api-storage/generate-path' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.originalName) {
        return errorResponse('INVALID_BODY', 'Original file name is required');
      }

      const { originalName, memberCode, userId } = body;

      try {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const extension = originalName.split('.').pop();

        // Use member code if available, otherwise use userId, otherwise use user.id
        const folderName = memberCode || userId || user.id;
        const path = `${folderName}/${timestamp}-${randomString}.${extension}`;

        return successResponse({
          path: path,
          originalName: originalName,
          extension: extension,
          folderName: folderName,
        });

      } catch (error) {
        return errorResponse('PATH_GENERATION_ERROR', 'Failed to generate file path', error.message);
      }
    }

    // GET /api-storage/list/{bucket} - List files in bucket
    if (pathname.startsWith('/api-storage/list/') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const bucket = pathname.split('/api-storage/list/')[1];
      const params = getQueryParams(req.url);
      const prefix = params.prefix || '';
      const limit = parseInt(params.limit || '100');
      const offset = parseInt(params.offset || '0');

      if (!bucket) {
        return errorResponse('MISSING_BUCKET', 'Bucket name is required');
      }

      try {
        const { data: files, error: listError } = await supabase.storage
          .from(bucket)
          .list(prefix, {
            limit: limit,
            offset: offset,
            sortBy: { column: 'created_at', order: 'desc' }
          });

        if (listError) {
          return errorResponse('LIST_FAILED', listError.message);
        }

        return successResponse({
          files: files || [],
          bucket: bucket,
          prefix: prefix,
          total: files?.length || 0,
        });

      } catch (error) {
        return errorResponse('LIST_ERROR', 'Failed to list files', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Storage API error:', error);

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});