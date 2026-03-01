// Edge Functions API Types
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
    isPartner?: boolean;
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
  is_seller?: boolean | null;
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

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string
          member_code: string | null
          social_id: string | null
          email: string | null
          name: string | null
          role: 'normal' | 'partner' | 'admin'
          profile_image: string | null
          favorite_game: string | null
          game_info: any | null
          greeting: string | null
          current_status: 'online' | 'offline' | 'matching' | 'in_game'
          total_points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_code?: string | null
          social_id?: string | null
          email?: string | null
          name?: string | null
          role?: 'normal' | 'partner' | 'admin'
          profile_image?: string | null
          favorite_game?: string | null
          game_info?: any | null
          greeting?: string | null
          current_status?: 'online' | 'offline' | 'matching' | 'in_game'
          total_points?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_code?: string | null
          social_id?: string | null
          email: string | null
          name?: string | null
          role?: 'normal' | 'partner' | 'admin'
          profile_image?: string | null
          favorite_game?: string | null
          game_info?: any | null
          greeting?: string | null
          current_status?: 'online' | 'offline' | 'matching' | 'in_game'
          total_points?: number
          created_at?: string
          updated_at?: string
        }
      }
      partners: {
        Row: {
          id: string
          member_id: string
          partner_name: string | null
          partner_message: string | null
          partner_status: 'none' | 'pending' | 'approved' | 'rejected'
          partner_applied_at: string
          partner_reviewed_at: string | null
          total_points: number
          game_info: any | null
          tosspayments_seller_id: string | null
          tosspayments_ref_seller_id: string | null
          tosspayments_status: string | null
          tosspayments_synced_at: string | null
          tosspayments_last_error: string | null
          tosspayments_business_type: string | null
          legal_name: string | null
          legal_email: string | null
          legal_phone: string | null
          payout_bank_code: string | null
          payout_bank_name: string | null
          payout_account_number: string | null
          payout_account_holder: string | null
          tax: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          partner_name?: string | null
          partner_message?: string | null
          partner_status?: 'none' | 'pending' | 'approved' | 'rejected'
          partner_applied_at?: string
          partner_reviewed_at?: string | null
          total_points?: number
          game_info?: any | null
          tosspayments_seller_id?: string | null
          tosspayments_ref_seller_id?: string | null
          tosspayments_status?: string | null
          tosspayments_synced_at?: string | null
          tosspayments_last_error?: string | null
          tosspayments_business_type?: string | null
          legal_name?: string | null
          legal_email?: string | null
          legal_phone?: string | null
          payout_bank_code?: string | null
          payout_bank_name?: string | null
          payout_account_number?: string | null
          payout_account_holder?: string | null
          tax?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          partner_name?: string | null
          partner_message?: string | null
          partner_status?: 'none' | 'pending' | 'approved' | 'rejected'
          partner_applied_at?: string
          partner_reviewed_at?: string | null
          total_points?: number
          game_info?: any | null
          tosspayments_seller_id?: string | null
          tosspayments_ref_seller_id?: string | null
          tosspayments_status?: string | null
          tosspayments_synced_at?: string | null
          tosspayments_last_error?: string | null
          tosspayments_business_type?: string | null
          legal_name?: string | null
          legal_email?: string | null
          legal_phone?: string | null
          payout_bank_code?: string | null
          payout_bank_name?: string | null
          payout_account_number?: string | null
          payout_account_holder?: string | null
          tax?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      partner_jobs: {
        Row: {
          id: string
          partner_id: string
          job_name: string
          coins_per_job: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          job_name: string
          coins_per_job: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          job_name?: string
          coins_per_job?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      partner_requests: {
        Row: {
          id: string
          client_id: string
          partner_id: string
          partner_job_id: string | null
          request_type: string
          job_count: number
          coins_per_job: number | null
          total_coins: number
          status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          call_id: string | null
          requested_at: string
          started_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          partner_id: string
          partner_job_id?: string | null
          request_type?: string
          job_count: number
          coins_per_job?: number | null
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          call_id?: string | null
          requested_at?: string
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          partner_id?: string
          partner_job_id?: string | null
          request_type?: string
          job_count?: number
          coins_per_job?: number | null
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          call_id?: string | null
          requested_at?: string
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      jobs: {
        Row: {
          id: string
          request_id: string
          partner_id: string
          client_id: string
          partner_job_id: string | null
          job_name: string | null
          coins_per_job: number | null
          review_code: string
          is_reviewed: boolean
          created_at: string
          completed_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          partner_id: string
          client_id: string
          partner_job_id?: string | null
          job_name?: string | null
          coins_per_job?: number | null
          review_code?: string
          is_reviewed?: boolean
          created_at?: string
          completed_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          partner_id?: string
          client_id?: string
          partner_job_id?: string | null
          job_name?: string | null
          coins_per_job?: number | null
          review_code?: string
          is_reviewed?: boolean
          created_at?: string
          completed_at?: string | null
          updated_at?: string
        }
      }
      reviews: {
        Row: {
          id: number
          member_id: string | null
          target_partner_id: string | null
          rating: number | null
          comment: string | null
          points_earned: number
          review_code: string | null
          created_at: string
        }
        Insert: {
          id?: number
          member_id?: string | null
          target_partner_id?: string | null
          rating?: number | null
          comment?: string | null
          points_earned?: number
          review_code?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          member_id?: string | null
          target_partner_id?: string | null
          rating?: number | null
          comment?: string | null
          points_earned?: number
          review_code?: string | null
          created_at?: string
        }
      }
      member_points_logs: {
        Row: {
          id: number
          member_id: string
          type: 'earn' | 'spend' | 'withdraw'
          amount: number
          description: string | null
          related_review_id: number | null
          log_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          member_id: string
          member_name: string | null
          type: 'earn' | 'spend' | 'withdraw'
          amount: number
          description?: string | null
          related_review_id?: number | null
          log_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          member_id?: string
          type?: 'earn' | 'spend' | 'withdraw' | 'charge' | 'refund'
          amount?: number
          description?: string | null
          related_review_id?: number | null
          log_id?: string | null
          created_at?: string
        }
      }
      partner_points_logs: {
        Row: {
          id: number
          partner_id: string
          partner_name: string | null
          type: 'earn' | 'spend' | 'withdraw'
          amount: number
          description: string | null
          related_review_id: number | null
          bank_name: string | null
          bank_num: string | null
          bank_owner: string | null
          created_at: string
        }
        Insert: {
          id?: number
          partner_id: string
          type: 'earn' | 'spend' | 'withdraw'
          amount: number
          description?: string | null
          related_review_id?: number | null
          bank_name?: string | null
          bank_num?: string | null
          bank_owner?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          partner_id?: string
          type?: 'earn' | 'spend' | 'withdraw' | 'charge' | 'refund'
          amount?: number
          description?: string | null
          related_review_id?: number | null
          bank_name?: string | null
          bank_num?: string | null
          bank_owner?: string | null
          created_at?: string
        }
      }
      partner_withdrawals: {
        Row: {
          id: string
          partner_id: string
          requested_amount: number
          bank_owner: string | null
          bank_name: string | null
          bank_num: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          requested_at: string
          reviewed_at: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          requested_amount: number
          bank_owner?: string | null
          bank_name?: string | null
          bank_num?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          requested_at?: string
          reviewed_at?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          requested_amount?: number
          bank_owner?: string | null
          bank_name?: string | null
          bank_num?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
          requested_at?: string
          reviewed_at?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ad_banners: {
        Row: {
          id: string
          title: string
          description: string | null
          background_image: string | null
          mobile_background_image: string | null
          link_url: string | null
          display_location: 'main' | 'partner_dashboard'
          start_at: string | null
          end_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          background_image?: string | null
          mobile_background_image?: string | null
          link_url?: string | null
          display_location?: 'main' | 'partner_dashboard'
          start_at?: string | null
          end_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          background_image?: string | null
          mobile_background_image?: string | null
          link_url?: string | null
          display_location?: 'main' | 'partner_dashboard'
          start_at?: string | null
          end_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      member_chats: {
        Row: {
          id: number
          sender_id: string | null
          receiver_id: string | null
          message: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: number
          sender_id?: string | null
          receiver_id?: string | null
          message: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          sender_id?: string | null
          receiver_id?: string | null
          message?: string
          is_read?: boolean
          created_at?: string
        }
      }
      call_rooms: {
        Row: {
          id: string
          room_code: string | null
          status: 'waiting' | 'in_call' | 'ended'
          started_at: string | null
          ended_at: string | null
          member_id: string | null
          partner_id: string | null
          topic: string | null
          last_signal_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          room_code?: string | null
          status?: 'waiting' | 'in_call' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          member_id?: string | null
          partner_id?: string | null
          topic?: string | null
          last_signal_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          room_code?: string | null
          status?: 'waiting' | 'in_call' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          member_id?: string | null
          partner_id?: string | null
          topic?: string | null
          last_signal_at?: string | null
          created_at?: string
        }
      }
      call_participants: {
        Row: {
          id: string
          room_id: string
          member_id: string
          joined_at: string
          left_at: string | null
          device_info: any | null
          connection_quality: 'excellent' | 'good' | 'poor' | 'disconnected'
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          member_id: string
          joined_at?: string
          left_at?: string | null
          device_info?: any | null
          connection_quality?: 'excellent' | 'good' | 'poor' | 'disconnected'
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          member_id?: string
          joined_at?: string
          left_at?: string | null
          device_info?: any | null
          connection_quality?: 'excellent' | 'good' | 'poor' | 'disconnected'
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      member_role: 'normal' | 'partner' | 'admin'
      partner_status: 'none' | 'pending' | 'approved' | 'rejected'
      member_status: 'online' | 'offline' | 'matching' | 'in_game'
      request_status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
      points_log_type: 'earn' | 'spend' | 'withdraw'
      withdrawal_status: 'pending' | 'approved' | 'rejected' | 'cancelled'
      call_room_status: 'waiting' | 'in_call' | 'ended'
      connection_quality: 'excellent' | 'good' | 'poor' | 'disconnected'
    }
  }
}
