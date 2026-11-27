import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from '../frontend/node_modules/vite/dist/node/index.js';
const root=fileURLToPath(new URL('../frontend',import.meta.url));
const output=fileURLToPath(new URL('../.cache/patient-files/',import.meta.url));
await mkdir(output,{recursive:true});
const server=await createServer({root,define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:54321'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-anon-key')},server:{host:'127.0.0.1',port:5194,strictPort:true}});
let browser;
try {
 await server.listen(); browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const page=await browser.newPage({viewport:{width:1366,height:1000}}); page.setDefaultTimeout(10000);
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 let accountType='admin'; const writes=[];
 const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.edu',role:'authenticated',aud:'authenticated',user_metadata:{},app_metadata:{}};
 const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
 const patients=[{id:'22222222-2222-4222-8222-222222222222',first_name:'Original',last_name:'Patient',age:30,allergies:[],medical_history:[],created_at:'2026-11-01T12:00:00Z'}];
 await page.route('http://127.0.0.1:54321/**',async route=>{
  const req=route.request(), url=new URL(req.url()), path=url.pathname;
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path.endsWith('/token'))return reply({access_token:jwt,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user});
  if(path.endsWith('/user'))return reply(user);
  if(path.endsWith('/profiles'))return reply({user_id:user.id,first_name:'Demo',last_name:'Admin',account_type:accountType,active:true,must_change_password:false});
  if(path.endsWith('/rpc/has_permission'))return reply(false);
  if(path.endsWith('/rpc/log_record_view'))return reply(null);
  if(path.endsWith('/rpc/my_live_patient_access'))return reply({read:false,register:false,schedule:false,checkIn:false});
  if(['courses','assigned_cases','simulation_participants','roles','profile_roles','course_enrollments'].some(table=>path.endsWith('/'+table)))return reply([]);
  if(path.endsWith('/patients')) {
   if(req.method()==='POST') {
    const data=req.postDataJSON(); writes.push(data);
    const added=(Array.isArray(data)?data:[data]).map((row,index)=>({...row,id:`33333333-3333-4333-8333-${String(patients.length+index).padStart(12,'0')}`,created_at:'2026-11-26T12:00:00Z'}));
    patients.push(...added); return reply(Array.isArray(data)?added:added[0]);
   }
   return reply(req.headers().accept?.includes('vnd.pgrst.object')?patients.find(row=>'eq.'+row.id===url.searchParams.get('id')):patients);
  }
  throw new Error('Unexpected patient-file test request: '+path);
 });
 await page.goto('http://127.0.0.1:5194');
 await page.getByLabel('Email',{exact:true}).fill(user.email); await page.getByLabel('Password',{exact:true}).fill('Temporary123');
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await page.getByRole('button',{name:'Patients',exact:true}).click();
 await page.getByText('Patient files (CSV/XML)',{exact:true}).click();
 const xml=await page.evaluate(async()=>{
  const {patientFileText,parsePatientFile}=await import('/src/lib/patientFiles.js');
  const text=patientFileText([{first_name:'XML',last_name:'Patient',age:20,address:'One & Two, Unit A',allergies:['Peanuts, tree nuts'],current_medications:[{name:'Demo medicine',dosage:0}]}],'xml');
  const parsed=parsePatientFile(text);
  if(parsed.errors.length||parsed.rows[0].address!=='One & Two, Unit A'||parsed.rows[0].current_medications[0].dosage!==0)throw new Error('XML round trip failed');
  if(!parsePatientFile('<!DOCTYPE patients><patients/>').errors.length)throw new Error('DOCTYPE was accepted');
  return text;
 });
 await page.getByLabel('Import patient file',{exact:true}).setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('first_name,last_name,age\nBad,Age,-1')});
 await page.getByRole('alert').filter({hasText:'Age must be a whole number'}).waitFor(); assert.equal(writes.length,0);
 await page.getByLabel('Import patient file',{exact:true}).setInputFiles({name:'patients.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await page.getByRole('button',{name:'Import patient records',exact:true}).click();
 await page.getByText('1 patient record(s) imported.',{exact:true}).waitFor();
 assert.equal(writes.length,1); assert.deepEqual(patients[1].allergies,['Peanuts, tree nuts']);
 await page.getByLabel('Import patient file',{exact:true}).setInputFiles({name:'duplicate.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await page.getByRole('alert').filter({hasText:'already exists'}).waitFor(); assert.equal(writes.length,1);
 await page.getByLabel('Import patient file',{exact:true}).setInputFiles({name:'patients.csv',mimeType:'text/csv',buffer:Buffer.from('first_name,last_name,age\nCSV,Patient,40')});
 await page.getByRole('button',{name:'Import patient records',exact:true}).click();
 await page.getByText('1 patient record(s) imported.',{exact:true}).waitFor();
 assert.equal(writes.length,2);
 for(const format of ['CSV','XML']) {
  const downloadEvent=page.waitForEvent('download'); await page.getByRole('button',{name:`Export patients as ${format}`,exact:true}).click();
  const download=await downloadEvent; const content=await readFile(await download.path(),'utf8');
  const imported=await page.evaluate(async content=>(await import('/src/lib/patientFiles.js')).parsePatientFile(content),content);
  assert.deepEqual(imported.errors,[]); assert.equal(imported.rows.length,3);
 }
 await page.screenshot({path:`${output}registry-files.png`,fullPage:true});
 await page.getByRole('button',{name:'Create patient',exact:true}).click();
 await page.getByLabel('First name *',{exact:true}).fill('Sidebar');
 await page.getByLabel('Last name *',{exact:true}).fill('Patient');
 await page.getByLabel('Age *',{exact:true}).fill('41');
 await page.getByRole('tabpanel').getByRole('button',{name:'Create patient',exact:true}).click();
 await page.getByRole('heading',{name:'Sidebar Patient',exact:true}).waitFor();
 assert.equal(patients.at(-1).first_name,'Sidebar');
 await page.screenshot({path:`${output}sidebar-patient.png`,fullPage:true});
 accountType='student'; await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('button',{name:'Create patient',exact:true}).waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('PASS: patient CSV/XML round trips, validation, duplicate protection, downloads, sidebar creation and role restrictions');
} finally {await browser?.close();await server.close();}
