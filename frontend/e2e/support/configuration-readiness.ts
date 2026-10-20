import { expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { z } from 'zod';
export type ReadinessShape = 'default_board' | 'default_filters' | 'canonical_references' | 'stage_coverage' | 'creation_defaults' | 'workflow_progression' | 'configuration_limit';
const uuid = z.uuid();
/** Historical diagnostic fixtures never expose an unprotected CHECK across a commit. */
export async function readinessFixture(projectId: string, shape: ReadinessShape): Promise<() => Promise<void>> {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !uuid.safeParse(projectId).success || projectId === '20000000-0000-4000-8000-000000000001')
        throw new Error('Readiness fixtures require the owning isolated browser database and disposable project.');
    const run = async (sql: string) => {
        const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql]);
        return result.stdout.trim();
    };
    const guard = `IF current_database()<>'${database}' OR NOT EXISTS(SELECT 1 FROM projects WHERE id='${projectId}') THEN RAISE EXCEPTION 'Owned disposable project required'; END IF;`;
    const sql: Partial<Record<ReadinessShape, string>> = {
        default_board: `UPDATE board_records SET is_default=false WHERE project_id='${projectId}' AND is_default;`,
        stage_coverage: `DELETE FROM board_column_stages WHERE project_id='${projectId}';`,
        creation_defaults: `UPDATE issue_type_workflows b SET is_default=false,accepts_new=false FROM issue_types t WHERE b.project_id='${projectId}' AND t.project_id=b.project_id AND t.id=b.type_id AND t.is_default AND t.behavior='standard';`,
        workflow_progression: `UPDATE workflow_transitions SET retired=true WHERE project_id='${projectId}';`,
        configuration_limit: `WITH inserted AS(INSERT INTO workflows(id,project_id,name) SELECT gen_random_uuid(),'${projectId}'::uuid,'Activation fixture '||n FROM generate_series(1,1001)n RETURNING id,project_id) INSERT INTO issue_type_workflows(project_id,type_id,workflow_id,is_default,accepts_new) SELECT i.project_id,t.id,i.id,false,true FROM inserted i JOIN issue_types t ON t.project_id=i.project_id AND t.is_default AND t.behavior='standard';`,
    };
    if (shape !== 'default_filters' && shape !== 'canonical_references') {
        await run('DO $fixture$ BEGIN ' + guard + ' END $fixture$;' + sql[shape]);
        return async () => {
        };
    }
    const table = shape === 'default_filters' ? 'board_records' : 'issue_records', constraint = shape === 'default_filters' ? 'boards_check' : 'issues_canonical_required';
    const schema = z.object({ definition: z.string().startsWith('CHECK '), validated: z.literal(true) }).strict().parse(JSON.parse(await run(`SELECT json_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated) FROM pg_constraint WHERE conrelid='${table}'::regclass AND conname='${constraint}';`)));
    const triggerSchema = z.object({ definition: z.string().startsWith('CREATE TRIGGER '), enabled: z.literal('O') }).strict();
    const triggerSql = `SELECT json_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) FROM pg_trigger t WHERE t.tgrelid='issue_records'::regclass AND t.tgname='issues_canonical_shape' AND NOT t.tgisinternal AND t.tgfoid='check_canonical_issue_shape()'::regprocedure;`;
    const originalTrigger = shape === 'canonical_references' ? triggerSchema.parse(JSON.parse(await run(triggerSql))) : undefined;
    let targetId: string, alter: string, repair: string;
    if (shape === 'default_filters') {
        targetId = uuid.parse(await run(`SELECT id FROM board_records WHERE project_id='${projectId}' AND is_default AND archived_at IS NULL AND saved_filters='{}'::jsonb;`));
        alter = `UPDATE board_records SET saved_filters='{"query":"historical filter"}'::jsonb WHERE id='${targetId}' AND project_id='${projectId}';`;
        repair = `UPDATE board_records SET saved_filters='{}'::jsonb WHERE id='${targetId}' AND project_id='${projectId}';`;
    }
    else {
        const record = z.object({ id: uuid, typeId: uuid, priorityId: uuid, workflowId: uuid, stageId: uuid }).strict().parse(JSON.parse(await run(`SELECT json_build_object('id',id,'typeId',type_id,'priorityId',priority_id,'workflowId',workflow_id,'stageId',stage_id) FROM issue_records WHERE project_id='${projectId}';`)));
        targetId = record.id;
        alter = `UPDATE issue_records SET type_id=NULL,priority_id=NULL,workflow_id=NULL,stage_id=NULL WHERE id='${targetId}' AND project_id='${projectId}';`;
        repair = `UPDATE issue_records SET type_id='${record.typeId}',priority_id='${record.priorityId}',workflow_id='${record.workflowId}',stage_id='${record.stageId}' WHERE id='${targetId}' AND project_id='${projectId}';`;
    }
    const lock = `PERFORM pg_advisory_xact_lock(hashtextextended('gategold.e2e.readiness.${constraint}',0));`;
    // The ordinary API cannot produce these two states. They represent retained
    // pre-validation data: the identical CHECK is restored NOT VALID in the same
    // transaction, so every future insert/update remains checked while Go/UI
    // actually diagnoses the retained owned row. No foreign key is disabled.
    const dropShapeTrigger = shape === 'canonical_references' ? `
 SELECT pg_get_triggerdef(t.oid),t.tgenabled INTO STRICT original_trigger,original_enabled FROM pg_trigger t WHERE t.tgrelid='issue_records'::regclass AND t.tgname='issues_canonical_shape' AND NOT t.tgisinternal AND t.tgfoid='check_canonical_issue_shape()'::regprocedure;
 IF original_enabled<>'O' THEN RAISE EXCEPTION 'Expected enabled canonical shape trigger';END IF;
 DROP TRIGGER issues_canonical_shape ON issue_records;` : '';
    const restoreShapeTrigger = shape === 'canonical_references' ? `
 EXECUTE original_trigger;
 SELECT pg_get_triggerdef(t.oid),t.tgenabled INTO STRICT restored_trigger,restored_enabled FROM pg_trigger t WHERE t.tgrelid='issue_records'::regclass AND t.tgname='issues_canonical_shape' AND NOT t.tgisinternal;
 IF restored_trigger IS DISTINCT FROM original_trigger OR restored_enabled IS DISTINCT FROM original_enabled THEN RAISE EXCEPTION 'Exact canonical trigger was not restored';END IF;` : '';
    const proveShapeTrigger = shape === 'canonical_references' ? `
 BEGIN UPDATE issue_records SET type_id=type_id WHERE id='${targetId}' AND project_id='${projectId}';
 EXCEPTION WHEN no_data_found THEN GET STACKED DIAGNOSTICS trigger_context=PG_EXCEPTION_CONTEXT;IF position('check_canonical_issue_shape()' IN trigger_context)=0 THEN RAISE;END IF;shape_protected:=true;END;
 IF NOT shape_protected THEN RAISE EXCEPTION 'The restored canonical trigger did not protect new writes';END IF;` : '';
    await run(`DO $fixture$ DECLARE original text;protected boolean:=false;actual_constraint text;original_trigger text;original_enabled "char";restored_trigger text;restored_enabled "char";trigger_context text;shape_protected boolean:=false;changed integer;BEGIN ${guard}${lock}
 LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE;
 SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='${table}'::regclass AND conname='${constraint}' AND convalidated;
 IF original IS NULL THEN RAISE EXCEPTION 'Expected validated historical CHECK'; END IF;
 ALTER TABLE ${table} DROP CONSTRAINT ${constraint};${dropShapeTrigger}${alter}
 GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'Exactly one owned historical row is required';END IF;
 ${restoreShapeTrigger}
 EXECUTE format('ALTER TABLE ${table} ADD CONSTRAINT ${constraint} %s NOT VALID',original);
 BEGIN UPDATE ${table} SET id=id WHERE id='${targetId}' AND project_id='${projectId}';EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS actual_constraint=CONSTRAINT_NAME;IF actual_constraint<>'${constraint}' THEN RAISE;END IF;protected:=true;END;
 IF NOT protected THEN RAISE EXCEPTION 'The restored CHECK did not protect subsequent writes';END IF;
 ${proveShapeTrigger}
 END $fixture$;`);
    const restore = async () => {
        await run(`DO $fixture$ BEGIN ${guard}${lock}${repair} ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint}; END $fixture$;`);
        const restored = z.object({ definition: z.string(), validated: z.literal(true) }).strict().parse(JSON.parse(await run(`SELECT json_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated) FROM pg_constraint WHERE conrelid='${table}'::regclass AND conname='${constraint}';`)));
        expect(restored).toEqual(schema);
        if (originalTrigger)
            expect(triggerSchema.parse(JSON.parse(await run(triggerSql)))).toEqual(originalTrigger);
    };
    try {
        const retained = z.object({ definition: z.string(), validated: z.literal(false) }).strict().parse(JSON.parse(await run(`SELECT json_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated) FROM pg_constraint WHERE conrelid='${table}'::regclass AND conname='${constraint}';`)));
        expect(retained.definition).toBe(schema.definition + ' NOT VALID');
        if (originalTrigger)
            expect(triggerSchema.parse(JSON.parse(await run(triggerSql)))).toEqual(originalTrigger);
        return restore;
    }
    catch (error) {
        await restore();
        throw error;
    }
}
export const readinessCases = [
    ['UC-CFG-0077', 'default_board', 'Restore an active default board before activation.'],
    ['UC-CFG-0078', 'default_filters', 'The default board must show all project work. Clear its saved filters first.'],
    ['UC-CFG-0079', 'canonical_references', 'Complete canonical issue backfill before activation.'],
    ['UC-CFG-0080', 'stage_coverage', 'Map all open and occupied workflow stages to the default board.'],
    ['UC-CFG-0081', 'creation_defaults', 'Restore active standard/subtask defaults with eligible initial workflows.'],
    ['UC-CFG-0082', 'workflow_progression', 'Every workflow accepting or holding live work needs a valid initial stage and a path to Done.'],
    ['UC-CFG-0083', 'configuration_limit', 'Review projects with more than 1,000 active workflows before activation.'],
] as const;
