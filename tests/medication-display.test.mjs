import test from "node:test";
import assert from "node:assert/strict";
import { medicationName, medicationDetails } from "../frontend/src/components/medicationDisplay.js";

test("medications from the selector still show their saved name and dose", () => {
    const entry = { medicine: { id: 1, name: "Practice medicine", unit: "mg" }, dosage: 5, frequency: 2 };
    assert.equal(medicationName(entry), "Practice medicine");
    assert.equal(medicationDetails(entry), "5 mg, 2x/day");
});

test("flat portal records can be shown without a nested medicine object", () => {
    const entry = { name: "Demo medicine", dosage: 0, unit: "mg", frequency: "As recorded", instructions: "Demo instructions" };
    const before = structuredClone(entry);
    assert.equal(medicationName(entry), "Demo medicine");
    assert.equal(medicationDetails(entry), "0 mg, Demo instructions");
    assert.deepEqual(entry, before);
    assert.equal(medicationDetails({ frequency: "As recorded" }), "As recorded");
});

test("incomplete or text medication entries do not crash or invent a dose", () => {
    for (const entry of [null, undefined, {}, { medicine: null }]) {
        assert.equal(medicationName(entry), "Medication name not recorded");
        assert.equal(medicationDetails(entry), "");
    }
    assert.equal(medicationName("Saved medication text"), "Saved medication text");
    assert.equal(medicationDetails("Saved medication text"), "");
});
