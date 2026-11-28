import test from 'node:test';
import assert from 'node:assert/strict';
import {patientFileText,parsePatientFile} from '../frontend/src/lib/patientFiles.js';

const patient = {first_name:'Ana',last_name:'Smith',age:0,date_of_birth:'2026-11-01',phone_number:'+1 555-0100',
    address:'One Street, Unit "A"',allergies:['Peanuts, tree nuts'],medical_history:['Asthma'],
    immunizations:[{vaccine:'Demo vaccine',date:'2026-11-20',dose:'First'}],current_medications:[{name:'Demo medicine',dosage:0,unit:'mg'}],
    emergency_contacts:[{name:'Pat',phone:'555-0111'}],id:'private-id',portal_password:'PRIVATE'};

test('patient CSV round-trips structured chart fields, zero values and commas without credentials',()=>{
    const text = patientFileText([patient],'csv');
    assert.ok(!text.includes('private-id') && !text.includes('PRIVATE'));
    const parsed = parsePatientFile(text);
    assert.deepEqual(parsed.errors,[]);
    assert.equal(parsed.rows[0].age,0);
    assert.equal(parsed.rows[0].address,patient.address);
    assert.equal(parsed.rows[0].phone_number,patient.phone_number);
    assert.deepEqual(parsed.rows[0].allergies,patient.allergies);
    assert.deepEqual(parsed.rows[0].current_medications,patient.current_medications);
    assert.deepEqual(parsed.rows[0].emergency_contacts,patient.emergency_contacts);
});

test('patient imports validate the whole file and reject duplicates, bad dates, lists and unknown headers',()=>{
    const parse = (record)=>parsePatientFile(patientFileText([record],'csv'));
    assert.ok(parse({...patient,age:-1}).errors.length);
    assert.ok(parse({...patient,date_of_birth:'2026-02-30'}).errors.length);
    assert.ok(parse({...patient,immunizations:[{vaccine:'Demo',date:'2026-02-30'}]}).errors.length);
    assert.ok(parse({...patient,current_medications:[{name:{invalid:true}}]}).errors.length);
    assert.ok(parsePatientFile(patientFileText([patient,patient],'csv')).errors.length);
    assert.ok(parsePatientFile('id,first_name\nx,Ana').errors.length);
    assert.ok(parsePatientFile('first_name,last_name,age,allergies\nAna,Smith,20,not-json').errors.length);
    assert.ok(parsePatientFile('first_name,last_name,age\nAna,Smith').errors.length);
});
