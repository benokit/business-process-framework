ALTER TABLE entity_relations
    DROP CONSTRAINT entity_relations_target_entity_id_fkey,
    ADD CONSTRAINT entity_relations_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE RESTRICT
