// Existing test accounts are seeded after migrations, unlike production accounts.
export async function seedLegacyMemberships(db){
 await db.prepare("INSERT OR IGNORE INTO study_memberships(study_id,member_id,role,slot,joined_at) SELECT 'study',id,role,slot,COALESCE(joined_at,'2026-01-01T00:00:00Z') FROM members WHERE slot IS NOT NULL").run();
}
