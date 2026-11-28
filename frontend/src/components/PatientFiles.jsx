import {useState} from 'react';
import {supabase} from '../supabase.js';
import {parsePatientFile, downloadPatientFile} from '../lib/patientFiles.js';

export default function PatientFiles({patients, onImported}) {
    const [rows,setRows] = useState([]), [errors,setErrors] = useState([]), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
    async function chooseFile(event) {
        const file = event.target.files?.[0]; if (!file) return;
        setRows([]); setErrors([]); setNotice('');
        if (!/\.(csv|xml)$/i.test(file.name) || file.size > 2*1024*1024) { setErrors(['Choose a CSV or XML file smaller than 2 MB.']); return; }
        setBusy(true);
        try {
            const parsed = parsePatientFile(await file.text());
            const identity = (row) => [row.first_name?.toLowerCase(),row.last_name?.toLowerCase(),row.date_of_birth || row.age].join('|');
            const existing = new Set(patients.map(identity));
            for (const row of parsed.rows) if (existing.has(identity(row))) parsed.errors.push(`${row.first_name} ${row.last_name} already exists in this registry. Remove that row before importing.`);
            setRows(parsed.rows); setErrors(parsed.errors);
        }
        catch { setErrors(['Could not read this file. Choose it again.']); }
        finally { setBusy(false); event.target.value = ''; }
    }
    async function save() {
        if (busy || !rows.length || errors.length) return;
        setBusy(true); setErrors([]); setNotice('');
        try {
            const {error} = await supabase.from('patients').insert(rows);
            if (error) throw error;
            setNotice(`${rows.length} patient record(s) imported.`); setRows([]); onImported();
        } catch { setErrors(['The import could not be confirmed. Refresh the patient list before trying again.']); setRows([]); }
        finally { setBusy(false); }
    }
    return <details className="patient-file-panel">
        <summary>Patient files (CSV/XML)</summary>
        <p>Import new patient records or export the registry. Imports create new records and do not overwrite existing patients.</p>
        <div className="chart-actions">
            <button type="button" className="secondary-action-button" disabled={busy || !patients.length} onClick={()=>downloadPatientFile(patients,'csv')}>Export patients as CSV</button>
            <button type="button" className="secondary-action-button" disabled={busy || !patients.length} onClick={()=>downloadPatientFile(patients,'xml')}>Export patients as XML</button>
            <button type="button" className="secondary-action-button" onClick={()=>downloadPatientFile([{first_name:'Demo',last_name:'Patient',age:30}],'csv')}>Download CSV example</button>
            <button type="button" className="secondary-action-button" onClick={()=>downloadPatientFile([{first_name:'Demo',last_name:'Patient',age:30}],'xml')}>Download XML example</button>
        </div>
        <p>Allergies, history, diagnoses, immunizations, medications and contacts use JSON lists in these files. Visits, lab reports and portal accounts are kept separately.</p>
        <label>Import patient file<input type="file" accept=".csv,.xml" disabled={busy} onChange={chooseFile} /></label>
        {errors.length > 0 && <div role="alert">{errors.map((error,index)=><p key={index}>{error}</p>)}</div>}
        {rows.length > 0 && !errors.length && <div>
            <p>Review {rows.length} new patient record(s) before importing:</p>
            <ul>{rows.map((row,index)=><li key={index}>{row.first_name} {row.last_name} · Age {row.age}</li>)}</ul>
            <button type="button" className="primary-action-button" disabled={busy} onClick={save}>{busy?'Importing…':'Import patient records'}</button>
            <button type="button" className="secondary-action-button" disabled={busy} onClick={()=>setRows([])}>Cancel import</button>
        </div>}
        {notice && <p role="status">{notice}</p>}
    </details>;
}
