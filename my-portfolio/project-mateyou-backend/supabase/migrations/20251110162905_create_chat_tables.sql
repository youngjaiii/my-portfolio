-- Create chat_rooms table
CREATE TABLE public.chat_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    partner_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    message text NOT NULL,
    message_type text NOT NULL DEFAULT 'text',
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_chat_rooms_created_by ON public.chat_rooms(created_by);
CREATE INDEX idx_chat_rooms_partner_id ON public.chat_rooms(partner_id);
CREATE INDEX idx_chat_rooms_is_active ON public.chat_rooms(is_active);
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Create unique constraint to prevent duplicate chat rooms between same users
CREATE UNIQUE INDEX idx_chat_rooms_unique_pair ON public.chat_rooms(
    LEAST(created_by, partner_id),
    GREATEST(created_by, partner_id)
) WHERE is_active = true;

-- Enable RLS (Row Level Security)
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_rooms
CREATE POLICY "Users can view their own chat rooms" ON public.chat_rooms
    FOR SELECT USING (auth.uid() = created_by OR auth.uid() = partner_id);

CREATE POLICY "Users can create chat rooms" ON public.chat_rooms
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own chat rooms" ON public.chat_rooms
    FOR UPDATE USING (auth.uid() = created_by OR auth.uid() = partner_id);

CREATE POLICY "Users can delete their own chat rooms" ON public.chat_rooms
    FOR DELETE USING (auth.uid() = created_by OR auth.uid() = partner_id);

-- Create policies for chat_messages
CREATE POLICY "Users can view messages in their chat rooms" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_rooms
            WHERE id = room_id
            AND (created_by = auth.uid() OR partner_id = auth.uid())
        )
    );

CREATE POLICY "Users can send messages to their chat rooms" ON public.chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.chat_rooms
            WHERE id = room_id
            AND (created_by = auth.uid() OR partner_id = auth.uid())
        )
    );

-- Create trigger to update updated_at timestamp for chat_rooms
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_chat_rooms_updated_at
    BEFORE UPDATE ON public.chat_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();