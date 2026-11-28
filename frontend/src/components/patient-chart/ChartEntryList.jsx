export default function ChartEntryList({ name, entries, fields, onChange, addLabel, disabled }) {
    function update(index, key, value) {
        onChange(entries.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
    }
    return <fieldset className="chart-entry-list" disabled={disabled}>
        <legend className="chart-sr-only">{name}</legend>
        {entries.map((entry, index) => <div className="chart-entry-row" role="group" aria-label={`${name} entry ${index + 1}`} key={index}>
            {fields.map(({ key, label, type = "text" }) => <label className="chart-field" key={key}>
                <span>{label}</span>
                <input type={type} aria-label={`${label} ${index + 1}`} maxLength={type === 'text' ? 1000 : undefined}
                    value={entry[key] || ""} onChange={(event) => update(index, key, event.target.value)} />
            </label>)}
            <button type="button" className="secondary-action-button" aria-label={`Remove ${name.toLowerCase()} ${index + 1}`}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className="secondary-action-button"
            onClick={() => onChange([...entries, Object.fromEntries(fields.map(({ key }) => [key, ""]))])}>{addLabel}</button>
    </fieldset>;
}
