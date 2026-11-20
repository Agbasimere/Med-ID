import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Save, X } from 'lucide-react';
import { addPatientMedicalHistoryEntry, getPatientMedicalHistory } from '../lib/supabase';

const emptyForm = () => ({
  occurred_at: new Date().toISOString().slice(0, 10),
  category: 'Encounter',
  title: '',
  details: '',
  medication: '',
  dosage: '',
  provider: '',
  facility: '',
  status: 'Recorded'
});

function legacyRows(patient) {
  const rows = [];
  const add = (category, value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    values.map((item) => String(item).trim()).filter(Boolean).forEach((item) => rows.push({
      id: `profile-${category}-${item}`,
      occurred_at: patient.updated_at?.slice(0, 10) || '',
      category,
      title: item,
      details: 'Current patient profile',
      medication: '', dosage: '', provider: '', facility: '', status: 'Current'
    }));
  };
  add('Allergy', patient.allergies);
  add('Condition', patient.conditions);
  add('Medication', patient.medications);
  if (patient.blood_type) rows.push({
    id: 'profile-blood-type', occurred_at: patient.updated_at?.slice(0, 10) || '',
    category: 'Blood type', title: patient.blood_type, details: 'Current patient profile',
    medication: '', dosage: '', provider: '', facility: '', status: 'Current'
  });
  return rows;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function MedicalHistoryTable({ patient, canAdd = false, doctorProfile }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [feedback, setFeedback] = useState('');

  const refresh = async () => {
    if (!patient?.id) return;
    setLoading(true);
    setLoadError('');
    try { setEntries(await getPatientMedicalHistory(patient.id)); }
    catch (error) {
      setLoadError(error.message || 'Could not load the medical history. Apply the medical-history SQL migration, then refresh.');
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [patient?.id]);

  const rows = useMemo(() => [
    ...legacyRows(patient || {}),
    ...entries.map((entry) => ({ ...entry, id: entry.id }))
  ].sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))), [patient, entries]);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setFeedback('');
    try {
      const saved = await addPatientMedicalHistoryEntry(patient.id, {
        ...form,
        title: form.title.trim(),
        provider: form.provider || doctorProfile?.full_name || '',
        facility: form.facility || doctorProfile?.hospital || ''
      });
      setEntries((current) => [saved, ...current]);
      setForm(emptyForm());
      setShowForm(false);
      setFeedback('Record saved to the patient history.');
    } catch (error) {
      setFeedback(error.message || 'Could not save this record.');
    } finally { setSaving(false); }
  };

  const exportCsv = () => {
    const columns = ['Date', 'Category', 'Entry', 'Details', 'Medication', 'Dosage', 'Provider', 'Facility', 'Doctor license', 'Doctor hospital', 'Status'];
    const values = rows.map((row) => [row.occurred_at, row.category, row.title, row.details, row.medication, row.dosage, row.provider, row.facility, row.doctor_license_no, row.doctor_hospital, row.status]);
    const csv = [columns, ...values].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `MED-ID-${(patient.full_name || patient.id).replace(/[^a-z0-9-]/gi, '-')}-medical-history.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = 'corporate-input !py-2 !text-xs';

  return (
    <section className="corporate-card overflow-hidden border border-slate-200">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Patient Medical Record</h3>
          <p className="mt-1 text-xs text-slate-500">Structured history for {patient?.full_name || 'this patient'} · {rows.length} entries · Staff-managed clinical records</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="corporate-btn-secondary !px-3 !py-2 !text-xs" disabled={!rows.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </button>
          {canAdd && <button type="button" onClick={() => { setShowForm((open) => !open); setFeedback(''); }} className="corporate-btn-brand !px-3 !py-2 !text-xs">
            {showForm ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
            {showForm ? 'Close' : 'Add / amend record'}
          </button>}
        </div>
      </header>

      {feedback && <p role="status" className="border-b border-slate-100 px-5 py-2 text-xs text-brand-700">{feedback}</p>}
      {loadError && <p role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">{loadError}</p>}

      {showForm && canAdd && <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Date<input type="date" value={form.occurred_at} onChange={(e) => updateField('occurred_at', e.target.value)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600">Record type<select value={form.category} onChange={(e) => updateField('category', e.target.value)} className={inputClass}>{['Encounter', 'Diagnosis', 'Allergy', 'Medication', 'Procedure', 'Immunization', 'Lab result', 'Imaging', 'Vital signs', 'Care plan', 'Amendment'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Entry / title<input required value={form.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="e.g. Appendectomy, 2019" /></label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Clinical details<textarea value={form.details} onChange={(e) => updateField('details', e.target.value)} className={inputClass} rows={2} placeholder="Relevant findings, reaction, instructions, or context" /></label>
        <label className="text-xs font-semibold text-slate-600">Medication<input value={form.medication} onChange={(e) => updateField('medication', e.target.value)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600">Dose / frequency<input value={form.dosage} onChange={(e) => updateField('dosage', e.target.value)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600">Provider<input value={form.provider} onChange={(e) => updateField('provider', e.target.value)} className={inputClass} placeholder={doctorProfile?.full_name || ''} /></label>
        <label className="text-xs font-semibold text-slate-600">Facility<input value={form.facility} onChange={(e) => updateField('facility', e.target.value)} className={inputClass} placeholder={doctorProfile?.hospital || ''} /></label>
        <label className="text-xs font-semibold text-slate-600">Status<input value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass} /></label>
        <div className="flex items-end sm:col-span-2 lg:col-span-3"><button type="submit" disabled={saving || !form.title.trim()} className="corporate-btn-brand !px-4 !py-2 !text-xs">{saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Saving…' : 'Save to patient history'}</button></div>
      </form>}

      <div className="max-h-[30rem] overflow-auto">
        <table className="min-w-[1400px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600 shadow-sm">
            <tr>{['Date', 'Category', 'Entry', 'Clinical details', 'Medication', 'Dose / frequency', 'Provider', 'Facility', 'Doctor license', 'Doctor hospital', 'Status'].map((column) => <th key={column} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading patient history…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-500">{row.occurred_at || '—'}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">{row.category}</td>
              <td className="max-w-56 px-3 py-3 font-semibold text-slate-900">{row.title}</td>
              <td className="max-w-72 whitespace-pre-wrap px-3 py-3 text-slate-600">{row.details || '—'}</td>
              <td className="px-3 py-3 text-slate-700">{row.medication || '—'}</td>
              <td className="px-3 py-3 text-slate-700">{row.dosage || '—'}</td>
              <td className="px-3 py-3 text-slate-700">{row.provider || '—'}</td>
              <td className="px-3 py-3 text-slate-700">{row.facility || '—'}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">{row.doctor_license_no || '—'}</td>
              <td className="px-3 py-3 text-slate-700">{row.doctor_hospital || '—'}</td>
              <td className="px-3 py-3 text-slate-600">{row.status || 'Recorded'}</td>
            </tr>) : <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">No medical history details have been recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
        <span>Scroll within the table to review all records.</span>
        <button type="button" onClick={refresh} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"><RefreshCw className="h-3 w-3" /> Refresh</button>
      </footer>
    </section>
  );
}
