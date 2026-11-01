import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@supabase/server') return { url:'data:text/javascript,export const withSupabase = (options, handler) => handler;', shortCircuit:true };
    if (specifier === '@supabase/functions-js/edge-runtime.d.ts') return { url:'data:text/javascript,export {};', shortCircuit:true };
    return next(specifier, context);
} });
const { default: handler } = await import('../supabase/functions/create-patient-account/index.ts');
const patientId = '11111111-1111-4111-8111-111111111111';
const details = { patientId, email:' Patient@Example.edu ', password:'Temporary123' };
const request = (body = details) => new Request('http://localhost/create-patient-account', { method:'POST', body:JSON.stringify(body) });

function mock({ role = 'admin', active = true, existing = false, duplicate = false, finishFails = false, missing = false } = {}) {
    const calls = [];
    const ctx = {
        supabase: { auth: { getUser:async () => ({ data:{ user:{ id:'admin' } } }) } },
        supabaseAdmin: {
            from(table) {
                const result = () => ({ data: table === 'profiles' ? { account_type:role, active }
                    : table === 'patients' ? (missing ? null : { id:patientId })
                    : existing ? { user_id:'existing-patient-login' } : null });
                const query = { select:() => query, eq:() => query, single:async () => result(), maybeSingle:async () => result() };
                return query;
            },
            auth: { admin: {
                createUser:async (input) => { calls.push({ create:input }); return duplicate ? { error:{ code:'email_exists' } } : { data:{ user:{ id:'new-patient-login' } } }; },
                deleteUser:async (id) => { calls.push({ deleted:id }); return {}; },
            } },
            rpc:async (name, args) => { calls.push({ rpc:name, args }); return { error:finishFails ? { message:'link conflict' } : null }; },
        },
    };
    return { ctx, calls };
}

test('only an active admin can create patient portal access', async () => {
    for (const settings of [{ role:'instructor' }, { role:'student' }, { role:'patient' }, { active:false }]) {
        const { ctx, calls } = mock(settings);
        assert.equal((await handler.fetch(request(), ctx)).status, 403);
        assert.deepEqual(calls, []);
    }
});

test('bad input and missing patients cannot create accounts', async () => {
    for (const body of [null, [], {}, { ...details, patientId:'bad' }, { ...details, email:'bad' }, { ...details, password:'short' }, { ...details, password:'123456789' }]) {
        const { ctx, calls } = mock();
        assert.equal((await handler.fetch(request(body), ctx)).status, 400);
        assert.deepEqual(calls, []);
    }
    const { ctx, calls } = mock({ missing:true });
    assert.equal((await handler.fetch(request(), ctx)).status, 404);
    assert.deepEqual(calls, []);
});

test('existing links and duplicate emails are refused without reusing a staff or student account', async () => {
    const existing = mock({ existing:true });
    assert.equal((await handler.fetch(request(), existing.ctx)).status, 409);
    assert.deepEqual(existing.calls, []);
    const duplicate = mock({ duplicate:true });
    assert.equal((await handler.fetch(request(), duplicate.ctx)).status, 409);
    assert.ok(!duplicate.calls.some((c) => c.rpc));
});

test('new portal login is finalized once and incomplete setup removes that new login', async () => {
    const valid = mock();
    const response = await handler.fetch(request(), valid.ctx);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { account:{ id:'new-patient-login', email:'patient@example.edu' } });
    assert.deepEqual(valid.calls.find((c) => c.rpc), { rpc:'finish_patient_portal_account', args:{ p_user_id:'new-patient-login', p_patient_id:patientId } });
    assert.equal(valid.calls[0].create.email, 'patient@example.edu');
    const failure = mock({ finishFails:true });
    assert.equal((await handler.fetch(request(), failure.ctx)).status, 500);
    assert.deepEqual(failure.calls.at(-1), { deleted:'new-patient-login' });
});
