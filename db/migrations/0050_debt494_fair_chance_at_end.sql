-- DEBT-494 (ADR-022 Amendment): whether the learner had a fair chance at a
-- session item, recorded when its session ends.
--
-- A score counts an item only if the learner could reach it: its question was
-- available when the session ended, or, in tutor mode, the learner had already
-- answered it. That fact cannot be rebuilt later, because a question's past
-- availability is not kept, so the statement that ends a session writes it
-- for every item. Null while a session is active, and for a session that ended
-- before this column existed; readers treat null as a fair chance.
ALTER TABLE "practice_session_question_states" ADD COLUMN "fair_chance_at_end" boolean;
