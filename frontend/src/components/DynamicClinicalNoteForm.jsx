
function getFieldValue(data, key) {
    return key.split(".").reduce(
        (value, part) => value?.[part],
        data
    ) ?? "";
}

function setFieldValue(data, key, value) {
    const keys = key.split(".");
    const updated = structuredClone(data ?? {});
    let current = updated;

    for (let i = 0; i < keys.length - 1; i++) {
        const part = keys[i];

        if (
            !current[part] ||
            typeof current[part] !== "object"
        ) {
            current[part] = {};
        }

        current = current[part];
    }

    current[keys[keys.length - 1]] = value;

    return updated;
}

export default function DynamicClinicalNoteForm({
    template,
    value = {},
    onChange,
    disabled = false,
    readOnly = false,
}) {
    if (!template) {
        return <p>Please select a clinical note template.</p>;
    }

    const fields = Array.isArray(template.fields)
        ? template.fields
        : [];

    return (
        <div className="dynamic-clinical-note">
            <h3>{template.name}</h3>

            {template.description && (
                <p>{template.description}</p>
            )}

            {fields.map((field) => {
                const fieldValue = getFieldValue(
                    value,
                    field.key
                );

                return (
                    <div
                        key={field.key}
                        className="case-modal-section"
                    >
                        <label
                            className="case-modal-section-label"
                            htmlFor={`note-${field.key}`}
                        >
                            {field.label}
                            {field.required && " *"}
                        </label>

                        {field.type === "textarea" ? (
                            <textarea
                                id={`note-${field.key}`}
                                className="instructor-textarea"
                                rows={4}
                                value={fieldValue}
                                placeholder={field.placeholder ?? ""}
                                disabled={disabled}
                                readOnly={readOnly}
                                onChange={(e) =>
                                    onChange(
                                        setFieldValue(
                                            value,
                                            field.key,
                                            e.target.value
                                        )
                                    )
                                }
                                style={{ width: "100%" }}
                            />
                        ) : (
                            <input
                                id={`note-${field.key}`}
                                className="instructor-input"
                                type="text"
                                value={fieldValue}
                                placeholder={field.placeholder ?? ""}
                                disabled={disabled}
                                readOnly={readOnly}
                                onChange={(e) =>
                                    onChange(
                                        setFieldValue(
                                            value,
                                            field.key,
                                            e.target.value
                                        )
                                    )
                                }
                                style={{ width: "100%" }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
