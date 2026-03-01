-- Drop the problematic constraint
ALTER TABLE call_participants DROP CONSTRAINT IF EXISTS call_participants_actual_participant_check;

-- Update existing records to have both IDs before adding new constraint
UPDATE call_participants
SET actual_partner_id = (
  SELECT cr.partner_id
  FROM call_rooms cr
  WHERE cr.id = call_participants.room_id
)
WHERE actual_partner_id IS NULL AND actual_member_id IS NOT NULL;

UPDATE call_participants
SET actual_member_id = (
  SELECT cr.member_id
  FROM call_rooms cr
  WHERE cr.id = call_participants.room_id
)
WHERE actual_member_id IS NULL AND actual_partner_id IS NOT NULL;

-- Add new constraint that allows both to be present
ALTER TABLE call_participants
ADD CONSTRAINT call_participants_both_participants_allowed
CHECK (
  (participant_type = 'member' AND actual_member_id IS NOT NULL) OR
  (participant_type = 'partner' AND actual_partner_id IS NOT NULL) OR
  (actual_member_id IS NOT NULL AND actual_partner_id IS NOT NULL)
);