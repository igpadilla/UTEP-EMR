import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';


//
const root = fileURLToPath(new URL('../frontend', import.meta.url));
const output = fileURLToPath(new URL('../.cache/patient-portal/', import.meta.url));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: `${root}/vite.config.js`,
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key') },
    server: { host: '127.0.0.1', port: 5192, strictPort: true },
});
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [], unexpected = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let mustChange = true, fail = false, empty = false, accountType = 'patient', accountActive = true, failRelease = false;
    const patientId = '22222222-2222-4222-8222-222222222222';
    const visitId = '33333333-3333-4333-8333-333333333333';
    let portalAccount = null;
    const changes = [];
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'demo-patient@example.edu', role: 'authenticated', aud: 'authenticated', user_metadata: {}, app_metadata: {} };
    const jwt = () => `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role:'authenticated' })).toString('base64url')}.test`;
    const records = {
        patient: { first_name: 'Avery', last_name: 'Demo', date_of_birth: '1990-05-20' },
        medications: [{ name: 'Demo recorded medication', dosage: '5', unit: 'mg', frequency: '2', status: 'Active', prescriber: 'Dr. Demo' }],
        labs: [{ id: 'lab-1', test_name: 'Demo lab result', resulted_at: '2026-10-01', overall_flag: 'normal',
            values: [{ code:'demo', name:'Example value', value:'0', unit:'units', reference_range:'0–1', flag:'normal' }], result_note: 'A fictional result for the walkthrough.' }],
        last_visit: { visit_type: 'Follow-up', date: '2026-10-01', summary: 'Demo visit summary shared by the care team.\nFollow the recorded care plan.' },
    };
    const originalUser = structuredClone(user), originalRecords = structuredClone(records);
    const result = { id:'44444444-4444-4444-8444-444444444444', resulted_at:'2026-10-01T12:00:00Z',
        structured_values:[{ code:'demo',name:'Example value',value:0,unit:'units',reference_range:'0–1',flag:'normal' }],
        portal_released_at:null, portal_note:null, overall_flag:'normal' };
    await page.route('http://127.0.0.1:8000/**', (route) => route.fulfill({status:503,body:'Test backend unavailable'}));
    await page.route('http://127.0.0.1:54321/**', async (route) => {
        const req = route.request(), path = new URL(req.url()).pathname;
        const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (path.endsWith('/token')) return reply({ access_token: jwt(), refresh_token: 'test-refresh', token_type: 'bearer', expires_in:3600, user });
        if (path.endsWith('/user')) return reply(user);
        if (path.endsWith('/logout')) return reply({});
        if (path.endsWith('/rpc/log_record_view')) return reply(null);
        if (['assigned_cases', 'courses'].some((table) => path.endsWith(`/${table}`))) return reply([]);
        if (path.endsWith('/profiles')) return reply({ user_id:user.id, first_name:records.patient.first_name, last_name:'Demo', account_type:accountType, active:accountActive, must_change_password:mustChange });
        if (path.endsWith('/diagnostic_orders')) return reply([{ id:'order-one',patient_id:patientId,case_id:null,category:'lab',status:'completed',test_name:'Demo lab result',
            priority:'routine',coding_system:'LOINC',clinical_code:'demo',clinical_indication:'Fictional teaching record',created_at:'2026-10-01', diagnostic_results:[result] }]);
        if (path.endsWith('/rpc/set_diagnostic_result_portal_release')) {
            const body = req.postDataJSON();
            if (failRelease) return reply({message:'Test sharing failure'},500);
            assert.equal(body.p_result_id,result.id);
            result.portal_released_at = body.p_released ? '2026-10-02T12:00:00Z' : null;
            result.portal_note = body.p_note;
            return reply(null);
        }
        if (path.endsWith('/patients')) {
            const patient = { id:patientId, ...records.patient, age:36, current_medications:[], allergies:[], medical_history:[] };
            return reply(req.headers().accept?.includes('vnd.pgrst.object') ? patient : [patient]);
        }
        if (path.endsWith('/visits')) return reply([{ id:visitId, patient_id:patientId, visit_type:'Follow-up', notes:'Internal visit note', created_at:'2026-10-01' }]);
        if (path.endsWith('/rpc/patient_portal_account_status')) return reply(portalAccount);
        if (path.endsWith('/create-patient-account')) {
            const details = req.postDataJSON(); changes.push({ create:details });
            portalAccount = { email:details.email, active:true };
            return reply({ account:{ id:'new-account', email:details.email } });
        }
        if (path.endsWith('/rpc/set_patient_portal_access')) {
            const body = req.postDataJSON(); changes.push(body); portalAccount.active = body.p_active; return reply(null);
        }
        if (path.endsWith('/rpc/release_patient_visit_summary')) {
            changes.push(req.postDataJSON()); return reply(null);
        }
        if (path.endsWith('/rpc/set_must_change_password_false')) { mustChange = false; return reply(null); }
        if (path.endsWith('/rpc/get_my_patient_portal')) {
            assert.deepEqual(req.postDataJSON(), {});
            if (fail) return reply({ message:'Temporary outage' }, 503);
            return reply(empty ? { patient:records.patient, medications:[], labs:[], last_visit:null } : records);
            
        }
        unexpected.push(`${req.method()} ${path}`);
        return reply({ message:'Unexpected API call' }, 500);
    });
    await page.goto('http://127.0.0.1:5192');
    await page.getByLabel('Email', { exact:true }).fill(user.email);
    await page.getByLabel('Password', { exact:true }).fill('Temporary123');
    await page.getByRole('button', { name:'Sign In', exact:true }).click();
    await page.getByRole('heading', { name:'Change Password', exact:true }).waitFor();
    await page.getByLabel('New Password', { exact:true }).fill('ChangedPassword123');
    await page.getByLabel('Confirm Password', { exact:true }).fill('ChangedPassword123');
    await page.getByRole('button', { name:'Update Password', exact:true }).click();
    await page.getByRole('heading', { name:/Good .*Avery/ }).waitFor();
    await page.getByText('Demo recorded medication', { exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'Students', exact:true }).count(), 0);
    assert.equal(await page.getByRole('button', { name:/Edit|Schedule|Delete|Refill/ }).count(), 0);
    await page.screenshot({ path:`${output}/01-overview.png`, fullPage:true });
    for (const [nav, expected, shot] of [
        ['Medications & Prescriptions','Dr. Demo','02-medications'],
        ['Lab Results','Demo lab result','03-lab-results'],
        ['Last Visit Summary','Demo visit summary shared by the care team.','04-visit-summary'],
        ['My Profile',user.email,'05-profile'],
    ]) {
        await page.getByRole('navigation', { name:'Patient portal' }).getByRole('button', { name:nav, exact:true }).click();
        await page.getByText(expected, { exact:nav !== 'Last Visit Summary' }).waitFor();
        if (nav === 'Lab Results') {
            await page.getByRole('cell',{name:'0 units',exact:true}).waitFor();
            assert.equal(await page.getByRole('cell',{name:'0–1',exact:true}).count(),1);
        }
        await page.screenshot({ path:`${output}/${shot}.png`, fullPage:true });
    }
    empty = true;
    await page.getByRole('button', { name:'Refresh records', exact:true }).click();
    for (const [nav, text] of [['Medications & Prescriptions','No medications yet'], ['Lab Results','No lab results yet'], ['Last Visit Summary','No visit summary yet']]) {
        await page.getByRole('navigation').getByRole('button', { name:nav, exact:true }).click();
        await page.getByText(text, { exact:true }).waitFor();
    }
    fail = true;
    await page.getByRole('button', { name:'Refresh records', exact:true }).click();
    await page.getByRole('alert').filter({ hasText:'Unable to load your records' }).waitFor();
    fail = false; empty = false;
    await page.getByRole('button', { name:'Try again', exact:true }).click();
    await page.getByText('Demo visit summary shared by the care team.', { exact:false }).waitFor();
    await page.setViewportSize({ width:390, height:844 });
    await page.getByRole('navigation',{name:'Patient portal'}).getByRole('button',{name:'Lab Results',exact:true}).click();
    await page.getByRole('cell',{name:'0 units',exact:true}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.screenshot({path:`${output}/09-mobile-labs.png`,fullPage:true});
    await page.getByRole('button', { name:'My Health', exact:true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path:`${output}/06-mobile.png`, fullPage:true });
    await page.getByRole('button', { name:'Sign out', exact:true }).click();
    await page.getByRole('button', { name:'Sign In', exact:true }).waitFor();
    assert.equal(await page.getByText('Demo recorded medication', { exact:true }).count(), 0);

    // A second login cannot inherit the first patient's records or open content after deactivation.
    Object.assign(user,{id:'55555555-5555-4555-8555-555555555555',email:'second-patient@example.edu'});
    Object.assign(records,{patient:{first_name:'Jordan',last_name:'Demo',date_of_birth:'1992-05-20'},medications:[],labs:[],last_visit:null});
    await page.getByLabel('Email',{exact:true}).fill(user.email);
    await page.getByLabel('Password',{exact:true}).fill('Temporary123');
    await page.getByRole('button',{name:'Sign In',exact:true}).click();
    await page.getByRole('heading',{name:/Good .*Jordan/}).waitFor();
    assert.equal(await page.getByText('Demo recorded medication',{exact:true}).count(),0);
    await page.getByRole('navigation',{name:'Patient portal'}).getByRole('button',{name:'Lab Results',exact:true}).click();
    await page.getByText('No lab results yet',{exact:true}).waitFor();
    assert.equal(await page.getByText('Demo lab result',{exact:true}).count(),0);
    accountActive = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button',{name:'Sign In',exact:true}).waitFor();
    assert.equal(await page.getByRole('navigation',{name:'Patient portal'}).count(),0);
    Object.assign(user,originalUser); Object.assign(records,originalRecords); accountActive = true;

    // Check the staff path too, including the account and release forms
    accountType = 'admin';
    async function signInAndOpenPatient() {
        await page.getByLabel('Email', { exact:true }).fill('admin@example.edu');
        await page.getByLabel('Password', { exact:true }).fill('Temporary123');
        await page.getByRole('button', { name:'Sign In', exact:true }).click();
        await page.getByRole('button', { name:'Patients', exact:true }).click();
        await page.getByRole('cell', { name:'Avery Demo', exact:true }).click();
        await page.getByRole('tab', { name:'Visits', exact:true }).click();
    }
    await page.setViewportSize({ width:1366, height:1000 });
    await signInAndOpenPatient();
    await page.getByLabel('Patient sign-in email', { exact:true }).fill('new-patient@example.edu');
    await page.getByLabel('Temporary password', { exact:true }).fill('PatientTemporary123');
    await page.getByRole('button', { name:'Create patient portal access', exact:true }).click();
    await page.getByText('new-patient@example.edu · Active', { exact:true }).waitFor();
    await page.getByRole('button', { name:'Deactivate portal access', exact:true }).click();
    await page.getByRole('button', { name:'Reactivate portal access', exact:true }).click();
    await page.getByRole('button', { name:'Deactivate portal access', exact:true }).waitFor();
    await page.getByText('Share a visit summary', { exact:true }).click();
    await page.getByLabel('Recorded visit', { exact:true }).selectOption(visitId);
    await page.getByLabel('Summary for the patient', { exact:true }).fill('Summary entered by staff');
    await page.getByRole('button', { name:'Release visit summary to portal', exact:true }).click();
    await page.getByText('Visit summary released to the patient portal.', { exact:true }).waitFor();
    assert.equal(changes[0].create.patientId, patientId);
    assert.deepEqual(changes.slice(1,3).map((change) => change.p_active), [false,true]);
    assert.deepEqual(changes[3], { p_visit_id:visitId, p_summary:'Summary entered by staff' });
    await page.screenshot({ path:`${output}/07-staff-portal-controls.png`, fullPage:true });
    await page.getByRole('tab',{name:'Labs & Imaging',exact:true}).click();
    await page.getByLabel('Patient summary (optional)').fill('A summary intended for the patient.');
    failRelease = true;
    await page.getByRole('button',{name:'Share lab result with patient',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Test sharing failure'}).waitFor();
    assert.equal(await page.getByLabel('Patient summary (optional)').inputValue(),'A summary intended for the patient.');
    failRelease = false;
    await page.getByRole('button',{name:'Share lab result with patient',exact:true}).click();
    await page.getByText('Shared with patient',{exact:false}).waitFor();
    await page.screenshot({path:`${output}/08-shared-lab-controls.png`,fullPage:true});
    await page.getByRole('button',{name:'Stop sharing with patient',exact:true}).click();
    await page.getByLabel('Patient summary (optional)').waitFor();
    assert.equal(result.portal_released_at,null);
    await page.getByRole('button', { name:'Sign Out', exact:true }).click();
    await page.getByRole('button', { name:'Sign In', exact:true }).waitFor();
    accountType = 'instructor';
    await signInAndOpenPatient();
    assert.equal(await page.getByRole('button', { name:'Create patient portal access', exact:true }).count(), 0);
    
    assert.equal(await page.getByRole('button', { name:'Deactivate portal access', exact:true }).count(), 0);
    
    await page.getByText('Share a visit summary', { exact:true }).waitFor();
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log('PASS: patient sign-in, password change, portal-only navigation, structured lab values including zero, empty states, mobile layout, account switching, deactivation, admin controls, visit summaries, lab sharing, failure recovery and unsharing');
} finally { await browser?.close(); await server.close(); }
