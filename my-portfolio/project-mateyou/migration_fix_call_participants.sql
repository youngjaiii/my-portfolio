-- Fix call_participants data to match call_rooms structure
-- This migration will update existing call_participants records to correctly assign partner_id and member_id

-- First, backup the current data
CREATE TABLE IF NOT EXISTS call_participants_backup AS
SELECT * FROM call_participants;

-- Update existing call_participants records
-- We need to match them with call_rooms to get the correct partner_id and member_id mapping

UPDATE call_participants cp
SET
  partner_id = (
    SELECT cr.partner_id
    FROM call_rooms cr
    WHERE cr.id = cp.room_id
  ),
  member_id = (
    SELECT cr.member_id
    FROM call_rooms cr
    WHERE cr.id = cp.room_id
  )
WHERE EXISTS (
  SELECT 1
  FROM call_rooms cr
  WHERE cr.id = cp.room_id
  AND cr.partner_id IS NOT NULL
  AND cr.member_id IS NOT NULL
);

-- For records where the participant is a partner (not a client), set member_id to null
UPDATE call_participants cp
SET
  member_id = NULL
WHERE EXISTS (
  SELECT 1
  FROM call_rooms cr
  JOIN partners p ON p.id = cr.partner_id
  WHERE cr.id = cp.room_id
  AND p.member_id = cp.member_id -- The participant is the partner
);

-- Clean up any orphaned records where room doesn't exist
DELETE FROM call_participants cp
WHERE NOT EXISTS (
  SELECT 1
  FROM call_rooms cr
  WHERE cr.id = cp.room_id
);

-- Add constraints to prevent future inconsistencies
-- Ensure at least one of member_id or partner_id is not null
ALTER TABLE call_participants
ADD CONSTRAINT call_participants_member_or_partner_check
CHECK (member_id IS NOT NULL OR partner_id IS NOT NULL);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_call_participants_room_member ON call_participants(room_id, member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_participants_room_partner ON call_participants(room_id, partner_id) WHERE partner_id IS NOT NULL;