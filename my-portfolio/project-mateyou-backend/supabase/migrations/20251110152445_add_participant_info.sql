-- Add actual participant information to call_participants table
-- This allows tracking who actually joined the call while maintaining call_rooms relationship

-- Add new columns to store actual participant info
ALTER TABLE call_participants
ADD COLUMN IF NOT EXISTS actual_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS actual_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS participant_type text;

-- Update existing records - assume they are all members for now (can be corrected later)
UPDATE call_participants
SET
  actual_member_id = member_id,
  actual_partner_id = NULL,
  participant_type = 'member'
WHERE participant_type IS NULL;

-- Add constraint after updating existing data
ALTER TABLE call_participants
ADD CONSTRAINT call_participants_participant_type_check
CHECK (participant_type IN ('member', 'partner'));

-- Add constraint to ensure actual participant info is consistent
ALTER TABLE call_participants
ADD CONSTRAINT call_participants_actual_participant_check
CHECK (
  (participant_type = 'member' AND actual_member_id IS NOT NULL AND actual_partner_id IS NULL) OR
  (participant_type = 'partner' AND actual_partner_id IS NOT NULL AND actual_member_id IS NULL)
);

-- Add comment to explain the difference
COMMENT ON COLUMN call_participants.member_id IS 'References the client from call_rooms (relationship context)';
COMMENT ON COLUMN call_participants.partner_id IS 'References the partner from call_rooms (relationship context)';
COMMENT ON COLUMN call_participants.actual_member_id IS 'The actual member who joined this call session';
COMMENT ON COLUMN call_participants.actual_partner_id IS 'The actual partner who joined this call session';
COMMENT ON COLUMN call_participants.participant_type IS 'Type of the actual participant: member or partner';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_call_participants_actual_member ON call_participants(actual_member_id) WHERE actual_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_participants_actual_partner ON call_participants(actual_partner_id) WHERE actual_partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_participants_type ON call_participants(participant_type);