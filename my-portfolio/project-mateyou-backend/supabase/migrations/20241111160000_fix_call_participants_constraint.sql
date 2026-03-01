-- Update call_participants constraints to require both actual_member_id and actual_partner_id
-- This reflects the new logic where both participants in the relationship are always stored

-- Drop the existing constraint
ALTER TABLE call_participants
DROP CONSTRAINT IF EXISTS call_participants_actual_participant_check;

-- Add new constraint that requires both IDs to be present
ALTER TABLE call_participants
ADD CONSTRAINT call_participants_both_participants_required
CHECK (
  actual_member_id IS NOT NULL AND
  actual_partner_id IS NOT NULL AND
  participant_type IN ('member', 'partner')
);

-- Update existing records to have both IDs
-- For records that only have actual_member_id, we need to find the corresponding partner_id from call_rooms
UPDATE call_participants
SET actual_partner_id = (
  SELECT cr.partner_id
  FROM call_rooms cr
  WHERE cr.id = call_participants.room_id
)
WHERE actual_partner_id IS NULL AND actual_member_id IS NOT NULL;

-- For records that only have actual_partner_id, we need to find the corresponding member_id from call_rooms
UPDATE call_participants
SET actual_member_id = (
  SELECT cr.member_id
  FROM call_rooms cr
  WHERE cr.id = call_participants.room_id
)
WHERE actual_member_id IS NULL AND actual_partner_id IS NOT NULL;

-- Update column comments to reflect new logic
COMMENT ON COLUMN call_participants.actual_member_id IS 'The client member in this relationship (always populated)';
COMMENT ON COLUMN call_participants.actual_partner_id IS 'The partner in this relationship (always populated)';
COMMENT ON COLUMN call_participants.participant_type IS 'Who actually joined this call session: member or partner';