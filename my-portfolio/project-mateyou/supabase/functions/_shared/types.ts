// Shared types for Edge Functions
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface Member {
  id: string;
  member_code: string;
  name: string;
  profile_image?: string;
  favorite_game?: string[];
  current_status: string;
  created_at: string;
}

export interface Partner {
  id: string;
  member_id: string;
  partner_name?: string;
  partner_message?: string;
  partner_status: 'none' | 'pending' | 'approved' | 'rejected';
  partner_applied_at: string;
  partner_reviewed_at?: string;
  total_points: number;
  coins_per_job: number;
  game_info?: any;
  created_at: string;
  updated_at: string;
  background_images?: any;
}

export interface PartnerWithMember extends Partner {
  member: Member;
  reviews?: Review[];
}

export interface PartnerJob {
  id: string;
  partner_id: string;
  job_name: string;
  job_description?: string;
  job_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  member_id: string;
  target_partner_id: string;
  rating: number;
  comment?: string;
  points_earned: number;
  created_at: string;
  reviewer_name?: string;
}

export interface ChatRoom {
  id: string;
  created_by: string;
  partner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  message: string;
  message_type: 'text' | 'image' | 'system';
  created_at: string;
}

// ========== Stream 관련 타입 ==========

export type StreamType = 'video' | 'audio';
export type StreamAccessType = 'public' | 'private' | 'subscriber';
export type StreamStatus = 'scheduled' | 'live' | 'ended';
export type StreamHostRole = 'owner' | 'co_host' | 'guest';
export type StreamChatType = 'text' | 'donation' | 'system';
export type StreamBanType = 'mute' | 'kick' | 'ban';
export type StreamRequestStatus = 'pending' | 'approved' | 'rejected';

export interface StreamRoom {
  id: string;
  host_partner_id?: string;
  host_member_id?: string;
  title: string;
  description?: string;
  stream_type: StreamType;
  access_type: StreamAccessType;
  password?: string;
  max_participants: number;
  viewer_count: number;
  total_viewers: number;
  status: StreamStatus;
  category_id?: string;
  tags?: string[];
  thumbnail_url?: string;
  is_hidden: boolean;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface StreamHost {
  id: string;
  room_id: string;
  partner_id?: string;
  member_id?: string;
  role: StreamHostRole;
  joined_at: string;
  left_at?: string;
}

export interface StreamViewer {
  id: string;
  room_id: string;
  member_id: string;
  joined_at: string;
  left_at?: string;
}

export interface StreamChat {
  id: number;
  room_id: string;
  sender_id: string;
  content: string;
  chat_type: StreamChatType;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
}

export interface StreamChatBan {
  id: string;
  room_id: string;
  target_member_id: string;
  banned_by_member_id: string;
  ban_type: StreamBanType;
  reason?: string;
  expires_at?: string;
  created_at: string;
}

export interface StreamSpeakerRequest {
  id: string;
  room_id: string;
  requester_member_id: string;
  status: StreamRequestStatus;
  message?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface CreateStreamRoomBody {
  title: string;
  description?: string;
  stream_type?: StreamType;
  access_type?: StreamAccessType;
  password?: string;
  max_participants?: number;
  category_id?: string;
  thumbnail_url?: string;
}

export interface JoinStreamRoomBody {
  password?: string;
}

export interface SendStreamChatBody {
  room_id: string;
  content: string;
  chat_type?: StreamChatType;
}

export interface BanStreamUserBody {
  room_id: string;
  target_member_id: string;
  ban_type: StreamBanType;
  reason?: string;
  duration_minutes?: number;
}

export interface RequestSpeakerBody {
  room_id: string;
  message?: string;
}