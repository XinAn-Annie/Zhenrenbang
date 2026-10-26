import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';

const database=resolve(process.argv[2]||new URL('../data/skills.sqlite',import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,value=>value.slice(1)));
const db=new DatabaseSync(database);
db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
try{
  const demoRequests=db.prepare(`SELECT id FROM help_requests WHERE
    id LIKE 'DEMO-%' OR id LIKE 'SEED-%' OR id LIKE 'TEST-%'
    OR visitor_id GLOB '*测试*' OR visitor_id GLOB '*验证*' OR visitor_id GLOB '*自动检查*'
    OR lower(visitor_id) GLOB '*demo*' OR lower(visitor_id) GLOB '*seed*' OR lower(visitor_id) GLOB '*sample*'
    OR raw_input_json GLOB '*演示订单*' OR raw_input_json GLOB '*测试订单*' OR raw_input_json GLOB '*联调验证*'
    OR raw_input_json GLOB '*公网跨设备接单验证*' OR raw_input_json GLOB '*实时输入验证订单*'
    OR raw_input_json GLOB '*解决电脑死机问题*' OR raw_input_json GLOB '*我不知道该如何使用非购买方式*'`).all().map(row=>row.id);
  const requestIds=[...new Set(demoRequests)];
  const sessionIds=requestIds.length?db.prepare(`SELECT id FROM service_sessions WHERE request_id IN (${requestIds.map(()=>'?').join(',')})`).all(...requestIds).map(row=>row.id):[];
  if(sessionIds.length)db.prepare(`DELETE FROM service_sessions WHERE id IN (${sessionIds.map(()=>'?').join(',')})`).run(...sessionIds);
  if(requestIds.length)db.prepare(`DELETE FROM help_requests WHERE id IN (${requestIds.map(()=>'?').join(',')})`).run(...requestIds);
  const orphaned=db.prepare('DELETE FROM service_sessions WHERE request_id IS NULL').run().changes;
  db.exec('COMMIT');
  console.log(JSON.stringify({removedRequests:requestIds.length,removedSessions:sessionIds.length+Number(orphaned)}));
}catch(error){db.exec('ROLLBACK');throw error}finally{db.close()}
