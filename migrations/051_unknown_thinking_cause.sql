-- Preserve legacy automatic labels as provenance, without treating them as facts.
INSERT OR IGNORE INTO concepts(id,family,label) VALUES ('process.cause_unknown','thinking_process','Cause not recorded');
