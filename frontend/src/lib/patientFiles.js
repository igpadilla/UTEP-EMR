import { readCsv } from './studentImport.js';
import { demographicsToForm, demographicsToUpdate } from '../components/patient-chart/patientChartForm.js';

export const PATIENT_FILE_FIELDS = ['first_name','last_name','age','date_of_birth','sex','occupation','phone_number','email','address',
    'allergies','medical_history','diagnoses','immunizations','current_medications','emergency_contacts'];
const lists = PATIENT_FILE_FIELDS.slice(9);
const quote = (value) => `"${String(value ?? '').replaceAll('"','""')}"`;
const escapeXml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const csvValue = (value) => quote(/^[=+\-@\t\r']/.test(String(value)) ? "'" + value : value);

export function patientFileText(patients, format) {
    const records = patients.map((patient) => Object.fromEntries(PATIENT_FILE_FIELDS.map((key) =>
        [key, lists.includes(key) ? JSON.stringify(Array.isArray(patient[key]) ? patient[key] : []) : patient[key] ?? ''])));
    if (format === 'xml') return '<?xml version="1.0" encoding="UTF-8"?>\n<patients>\n' + records.map((record) =>
        '  <patient>\n' + PATIENT_FILE_FIELDS.map((key) => `    <${key}>${escapeXml(record[key])}</${key}>`).join('\n') + '\n  </patient>').join('\n') + '\n</patients>\n';
    return PATIENT_FILE_FIELDS.join(',') + '\r\n' + records.map((record) => PATIENT_FILE_FIELDS.map((key) => csvValue(record[key])).join(',')).join('\r\n');
}

export function downloadPatientFile(patients, format) {
    const url = URL.createObjectURL(new Blob([patientFileText(patients, format)], {type:format === 'xml' ? 'application/xml;charset=utf-8' : 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `patient-records.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parsePatientFile(text) {
    const errors = [], rows = [];
    try {
        if (text.length > 2 * 1024 * 1024) throw new Error('Choose a patient file smaller than 2 MB.');
        let records;
        if (text.replace(/^\uFEFF/,'').trimStart().startsWith('<')) {
            if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML patient files cannot contain DOCTYPE or ENTITY declarations.');
            const document = new DOMParser().parseFromString(text.trim(), 'application/xml');
            if (document.querySelector('parsererror') || document.documentElement.tagName !== 'patients') throw new Error('Use valid XML with a <patients> root.');
            records = [...document.documentElement.children].map((node, index) => {
                if (node.tagName !== 'patient' || node.attributes.length) throw new Error(`Row ${index + 1}: Expected a <patient> entry.`);
                const record = {};
                for (const field of node.children) {
                    if (!PATIENT_FILE_FIELDS.includes(field.tagName) || field.tagName in record || field.children.length || field.attributes.length) throw new Error(`Row ${index + 1}: Unknown, repeated or nested field ${field.tagName}.`);
                    record[field.tagName] = field.textContent;
                }
                return record;
            });
        } else {
            const csv = readCsv(text.replace(/^\uFEFF/,''));
            const headers = csv.shift()?.fields;
            if (!headers?.length || new Set(headers).size !== headers.length || headers.some((key) => !PATIENT_FILE_FIELDS.includes(key))) throw new Error('Use the patient CSV headers from the example file.');
            records = csv.map(({fields,rowNumber}) => {
                if (fields.length !== headers.length) throw new Error(`Row ${rowNumber}: The number of values must match the header.`);
                return Object.fromEntries(headers.map((key, index) => [key, /^'[=+\-@\t\r']/.test(fields[index]) ? fields[index].slice(1) : fields[index]]));
            });
        }
        if (!records.length) throw new Error('Add at least one patient record.');
        const seen = new Set();
        for (const [index, record] of records.entries()) {
            try {
                const patient = {};
                for (const key of lists) {
                    patient[key] = record[key]?.trim() ? JSON.parse(record[key]) : [];
                    if (!Array.isArray(patient[key])) throw new Error(`${key} must be a JSON list.`);
                }
                for (const key of ['allergies','medical_history']) if (patient[key].some((entry) => typeof entry !== 'string')) throw new Error(`${key} must contain text entries.`);
                for (const key of ['diagnoses','immunizations','current_medications','emergency_contacts']) {
                    if (patient[key].some((entry) => !entry || (typeof entry !== 'string' && (typeof entry !== 'object' || Array.isArray(entry))))) throw new Error(`${key} contains an invalid entry.`);
                }
                if (patient.immunizations.some((entry) => typeof entry !== 'object' || typeof entry.vaccine !== 'string' || !entry.vaccine.trim())) throw new Error('Each immunization needs a vaccine name.');
                const checkTextFields = (entry, keys) => {
                    for (const key of keys) if (entry[key] != null && typeof entry[key] !== 'string') throw new Error(`${key} must be text.`);
                };
                for (const entry of patient.immunizations) {
                    checkTextFields(entry, ['vaccine','date','dose','notes']);
                    if (entry.date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0,10) !== entry.date)) throw new Error('Enter a valid immunization date.');
                }
                for (const entry of patient.diagnoses) if (typeof entry === 'object') checkTextFields(entry, ['code','description','status']);
                for (const entry of patient.emergency_contacts) {
                    if (typeof entry !== 'object') throw new Error('Emergency contacts must contain contact details.');
                    checkTextFields(entry, ['name','phone','relationship']);
                }
                for (const entry of patient.current_medications) if (typeof entry === 'object') {
                    checkTextFields(entry, ['name','unit','instructions','prescriber','status']);
                    for (const key of ['dosage','frequency']) if (entry[key] != null && !['string','number'].includes(typeof entry[key])) throw new Error(`Medication ${key} must be text or a number.`);
                    if (entry.medicine != null) {
                        if (typeof entry.medicine !== 'object' || Array.isArray(entry.medicine)) throw new Error('Medication details are invalid.');
                        checkTextFields(entry.medicine, ['name','unit']);
                    }
                }
                const details = demographicsToUpdate(demographicsToForm(record), {});
                delete details.last_visit; delete details.last_visit_notes;
                // The file supplies these contacts. The demographic form only edits one contact.
                delete details.emergency_contacts;
                Object.assign(patient, details);
                const identity = [patient.first_name.toLowerCase(),patient.last_name.toLowerCase(),patient.date_of_birth || patient.age].join('|');
                if (seen.has(identity)) throw new Error('This patient is listed more than once in the file.');
                seen.add(identity);
                rows.push(patient);
            } catch (error) { errors.push(`Patient ${index + 1}: ${error.message}`); }
        }
    } catch (error) { errors.push(error.message); }
    return { rows, errors };
}
