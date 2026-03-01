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