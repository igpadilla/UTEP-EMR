-- Audit patient room assignments and dismissals.
-- Reuse the existing PHI audit trigger function.
CREATE TRIGGER audit_room_occupancies
AFTER INSERT OR UPDATE OR DELETE
ON public.room_occupancies
FOR EACH ROW
EXECUTE FUNCTION private.log_phi_change();
