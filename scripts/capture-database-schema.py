"""Capture structural PostgreSQL catalog and PlantUML. Never export company rows."""
import argparse, json, subprocess
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--database', required=True)
parser.add_argument('--output', type=Path, required=True)
args=parser.parse_args()
if not args.database.replace('_','').isalnum(): raise SystemExit('Invalid local database name')
root=Path(__file__).resolve().parent.parent
command=['docker','compose','-f',str(root/'compose.dev.yaml'),'exec','-T','postgres']
def sql(query):
    return subprocess.check_output(command+['psql','--username=gategoldjira','--dbname='+args.database,'-v','ON_ERROR_STOP=1','-Atc',query],text=True).strip()
query="""
SELECT json_build_object(
 'capturedAt',current_timestamp,'postgresVersion',version(),
 'migration',(SELECT max(version_id) FROM goose_db_version WHERE is_applied),
 'tables',(SELECT json_agg(t ORDER BY name) FROM(
 SELECT c.relname AS name,
 (SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT coalesce(json_agg(json_build_object('name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname),'[]') FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
 (SELECT coalesce(json_agg(json_build_object('name',i.indexname,'definition',i.indexdef) ORDER BY i.indexname),'[]') FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename=c.relname) AS indexes
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r')t),
 'views',(SELECT json_agg(json_build_object('name',viewname,'definition',definition) ORDER BY viewname) FROM pg_views WHERE schemaname='public'),
 'foreignKeys',(SELECT json_agg(json_build_object('source',s.relname,'target',t.relname,'definition',pg_get_constraintdef(k.oid),'nullable',EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey) AND NOT a.attnotnull)) ORDER BY s.relname,k.conname) FROM pg_constraint k JOIN pg_class s ON s.oid=k.conrelid JOIN pg_class t ON t.oid=k.confrelid JOIN pg_namespace n ON n.oid=s.relnamespace WHERE k.contype='f' AND n.nspname='public'),
 'functions',(SELECT json_agg(json_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND l.lanname IN('plpgsql','sql')),
 'triggers',(SELECT json_agg(json_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)
);
"""
catalog=json.loads(sql(query));args.output.mkdir(parents=True,exist_ok=True)
(args.output/'schema-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
ddl=subprocess.check_output(command+['pg_dump','--username=gategoldjira','--dbname='+args.database,'--schema-only','--no-owner','--no-privileges'],text=True)
(args.output/'current-schema.sql').write_text(ddl)
application_count=sum(table['name'] != 'goose_db_version' for table in catalog['tables'])
lines=['@startuml GateGoldJira_Current_Schema','title GateGoldJira canonical storage\\nMigration '+str(catalog['migration'])+' | '+str(application_count)+' application tables','hide circle','hide methods','skinparam linetype ortho','skinparam shadowing false','skinparam defaultFontSize 11']
for table in catalog['tables']:
    if table['name']=='goose_db_version':continue
    primary=' '.join(c['definition'] for c in table['constraints'] if c['kind']=='p')
    lines+=['entity "'+table['name']+'" as '+table['name']+' {']
    for column in table['columns']:
        marker='* ' if not column['nullable'] else '  '
        key=' <<PK>>' if column['name'] in primary.replace('(',' ').replace(')',' ').replace(',',' ').split() else ''
        lines.append('  '+marker+column['name']+' : '+column['type']+key)
    lines.append('}')
seen=set()
for key in catalog['foreignKeys']:
    pair=(key['source'],key['target'])
    if pair in seen:continue
    seen.add(pair)
    lines.append(key['target']+' '+('|o' if key['nullable'] else '||')+'--o{ '+key['source'])
lines+=['note "Older API names are compatibility views.\\nFiles stay in private object storage.\\nHistorical versions, events and receipts remain retained." as Compatibility','@enduml']
(args.output/'current-schema.puml').write_text('\n'.join(lines)+'\n')
print('Captured structural schema:',catalog['migration'],len(catalog['tables'])-1,'application tables')
