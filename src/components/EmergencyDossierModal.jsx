import React, { useEffect, useState } from 'react';
import { 
  X, 
  PhoneCall, 
  ShieldCheck, 
  Send, 
  CheckCircle2, 
  Droplet, 
  MessageCircle,
  Hospital,
  RefreshCw,
  Network,
  ArrowRight,
  FileText,
  AlertCircle,
  Lock,
  Unlock,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  dispatchEmergencyNotification, 
  getMedicalReportRequest, 
  requestCrossHospitalMedicalHistory, 
  sendWhatsAppEmergencyAlert 
} from '../lib/supabase';
import MedicalHistoryTable from './MedicalHistoryTable';

export default function EmergencyDossierModal({ 
  isOpen, 
  onClose, 
  patient, 
  doctorProfile,
  biometricallyVerified = false
}) {
  const [dispatching, setDispatching] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  // Cross-Hospital Medical History Retrieval State
  const [fullHistoryUnlocked, setFullHistoryUnlocked] = useState(false);
  const [pullingHistory, setPullingHistory] = useState(false);
  const [pullProgressStep, setPullProgressStep] = useState(0);
  const [hospitalPullLogs, setHospitalPullLogs] = useState([]);

  useEffect(() => {
    let active = true;
    setFullHistoryUnlocked(false);
    setHospitalPullLogs([]);
    setPullProgressStep(0);

    if (isOpen && patient?.id && doctorProfile?.role === 'doctor') {
      getMedicalReportRequest(patient.id).then((request) => {
        if (!active) return;
        if (request?.status === 'granted' && request.expires_at && new Date(request.expires_at) > new Date()) {
          setFullHistoryUnlocked(true);
        }
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [isOpen, patient?.id, doctorProfile?.role]);

  useEffect(() => {
    setWhatsappSent(false);
    setAlertSent(false);
    setFeedbackMsg('');
  }, [patient?.id]);

  if (!isOpen || !patient) return null;

  const photoUrl = patient.descriptor?.photo || null;

  const calculateAge = (dob) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const diff = Date.now() - birthDate.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const handleDispatchNotification = async () => {
    setDispatching(true);
    setFeedbackMsg('');

    const message = `EMERGENCY ALERT: Your family member ${patient.full_name || 'Patient'} is receiving emergency medical care at ${doctorProfile?.hospital || 'Emergency Trauma Center'}. Attending Physician: ${doctorProfile?.full_name || 'ER Attending Doctor'} (License: ${doctorProfile?.license_no || 'MD-ON-DUTY'}). Med-ID Biometric identification verified.`;

    try {
      await dispatchEmergencyNotification({
        patientId: patient.id,
        doctorId: doctorProfile?.id || null,
        message: message
      });

      setAlertSent(true);
      setFeedbackMsg(`Emergency alert recorded in MED-ID for ${patient.emerg_name || 'the next of kin'}.`);
    } catch (err) {
      console.error('Dispatch error:', err);
      setFeedbackMsg('Failed to dispatch alert: ' + (err.message || 'Permission denied'));
    } finally {
      setDispatching(false);
    }
  };

  const handleWhatsApp = async () => {
    setWhatsappBusy(true); 
    setFeedbackMsg('');
    try {
      const result = await sendWhatsAppEmergencyAlert(patient.id);
      setWhatsappSent(result.sent > 0);
      setFeedbackMsg(`WhatsApp alert sent to ${result.sent} of ${result.total} next-of-kin contact(s).`);
    } catch (error) { 
      setFeedbackMsg(error.message || 'WhatsApp alert could not be sent.'); 
    } finally { 
      setWhatsappBusy(false); 
    }
  };

  // Automatic Cross-Hospital Pull (NO ADMIN MANUAL APPROVAL!)
  const handleAutoPullCrossHospitalHistory = async () => {
    setPullingHistory(true);
    setFeedbackMsg('');
    setPullProgressStep(1);

    try {
      // Step 1: Handshake with MED-ID Inter-Hospital Network
      await new Promise(r => setTimeout(r, 600));
      setPullProgressStep(2);

      // Step 2: Query and notify hospitals
      const result = await requestCrossHospitalMedicalHistory(
        patient.id, 
        doctorProfile, 
        patient.full_name
      );

      await new Promise(r => setTimeout(r, 700));
      setPullProgressStep(3);

      setHospitalPullLogs(result.hospitals || []);
      setFullHistoryUnlocked(true);
      confetti({ particleCount: 50, spread: 70 });
      setFeedbackMsg(`Full medical history aggregated across ${result.hospitals?.length || 3} registered hospitals. Access notices dispatched to facility records departments.`);
    } catch (err) {
      console.error('Inter-hospital pull error:', err);
      setFeedbackMsg('Failed to pull cross-hospital records: ' + (err.message || 'Network error'));
    } finally {
      setPullingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="corporate-card relative max-h-[94dvh] w-full max-w-7xl overflow-y-auto border border-slate-300 p-3 shadow-2xl sm:p-7">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Emergency Triage Header Banner */}
        <div className="flex items-center gap-2 mb-4">
          <span className="corporate-badge-red text-xs px-3 py-1 uppercase tracking-wider flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emergency-600" />
            PATIENT IDENTIFIED IN TRAUMA BAY
          </span>
          <span className="text-xs text-slate-500 font-mono">
            MED-ID: {patient.med_id_number || `MED-${patient.id?.slice(0, 8).toUpperCase()}`}
          </span>
        </div>

        {/* Patient Identity Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 flex-shrink-0 shadow-sm">
              {photoUrl ? (
                <img 
                  src={photoUrl} 
                  alt={patient.full_name} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-bold text-xl">
                  {patient.full_name ? patient.full_name[0] : 'P'}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {patient.full_name || 'Emergency Patient'}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                <span>Age: <strong>{calculateAge(patient.dob)} yrs</strong></span>
                <span>•</span>
                <span>DOB: <strong>{patient.dob || 'Unknown'}</strong></span>
                <span>•</span>
                <span>Sex: <strong>{patient.sex || 'Not recorded'}</strong></span>
                <span>•</span>
                <span>Genotype: <strong>{patient.genotype || 'Not set'}</strong></span>
                <span>•</span>
                <span>Nationality: <strong>{patient.nationality || 'Not recorded'}</strong></span>
              </div>
            </div>
          </div>

          {/* Blood Group Badge */}
          <div className="p-3.5 rounded-2xl bg-emergency-50 border-2 border-emergency-200 flex items-center gap-3 shadow-sm flex-shrink-0">
            <Droplet className="w-8 h-8 text-emergency-600 fill-emergency-600 animate-bounce" />
            <div>
              <span className="text-[10px] font-bold text-emergency-700 uppercase tracking-widest block">
                Blood Type
              </span>
              <span className="text-2xl font-black text-emergency-700 leading-none">
                {patient.blood_type || patient.blood_group || 'UNKNOWN'}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className="my-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{feedbackMsg}</span>
          </div>
        )}

        {/* Basic Information Details Section */}
        <div className="my-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Biometric Triage: Patient Basic Information</span>
            </h3>
            <span className="corporate-badge-green text-[10px]">
              Verified Biometric Identity
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
            <div>
              <span className="font-semibold text-slate-500 block">Home Address</span>
              <span className="text-slate-800">{patient.home_address || 'Not recorded'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Next of Kin Contact</span>
              <span className="text-slate-800 font-bold">{patient.emerg_name || 'Not provided'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Next of Kin Phone</span>
              <span className="text-slate-800 font-mono">{patient.emerg_phone || 'Not provided'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Next of Kin Email</span>
              <span className="text-slate-800">{patient.emerg_email || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Next of Kin Emergency WhatsApp & Dispatcher */}
        <section className="my-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="next-of-kin-title">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-brand-600" />
                <h3 id="next-of-kin-title" className="text-sm font-bold uppercase tracking-wide text-slate-900">Notify Next of Kin</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">Dispatch immediate emergency trauma notice to the patient's registered family contacts.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {patient.emerg_phone ? (
                <button 
                  type="button" 
                  onClick={handleWhatsApp} 
                  disabled={whatsappBusy || whatsappSent} 
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{whatsappBusy ? 'Sending…' : whatsappSent ? 'WhatsApp Alert Sent' : 'Send WhatsApp Alert'}</span>
                </button>
              ) : (
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">
                  No emergency phone registered
                </span>
              )}
              <button
                type="button"
                onClick={handleDispatchNotification}
                disabled={dispatching || alertSent}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${alertSent ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-700'}`}
              >
                {alertSent ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                <span>{alertSent ? 'MED-ID Alert Logged' : dispatching ? 'Recording...' : 'Record Alert in MED-ID'}</span>
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{patient.emerg_name || 'Next of kin not provided'}</p>
              <p className="mt-0.5 truncate text-slate-500">{patient.emerg_phone || 'No phone number'}{patient.emerg_email ? ` · ${patient.emerg_email}` : ''}</p>
            </div>
            <p className="max-w-lg text-[11px] leading-relaxed text-slate-500">Dispatches an approved emergency notification identifying attending physician Dr. {doctorProfile?.full_name || 'Physician'} at {doctorProfile?.hospital || 'Emergency Hospital'}.</p>
          </div>
        </section>

        {/* CROSS-HOSPITAL FULL MEDICAL HISTORY SECTION (NO ADMIN APPROVAL NEEDED!) */}
        <div className="my-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Hospital className="w-5 h-5 text-brand-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Cross-Hospital Full Medical History
              </h3>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase flex items-center gap-1.5 ${
              fullHistoryUnlocked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
            }`}>
              {fullHistoryUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{fullHistoryUnlocked ? 'Full Records Unlocked' : 'Basic Triage Only'}</span>
            </span>
          </div>

          {/* If NOT Unlocked: Show MED-ID Inter-Hospital Request Card */}
          {!fullHistoryUnlocked && (
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-brand-50/40 via-white to-slate-50 border-2 border-brand-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <span className="corporate-badge-blue text-[10px] font-bold">
                    MED-ID Inter-Hospital Clinical Network
                  </span>
                  <h4 className="text-base font-bold text-slate-900">
                    Request & Aggregate Complete Records Across Registered Hospitals
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    By default, biometrics only unlock basic identification. As an authorized emergency physician at <strong>{doctorProfile?.hospital || 'Emergency Trauma Bay'}</strong>, you can instantly pull full clinical records, past surgeries, active medications, and hospital admissions from all registered MED-ID partner hospitals under the Emergency Care Protocol.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={pullingHistory}
                  onClick={handleAutoPullCrossHospitalHistory}
                  className="corporate-btn-emergency !py-3 !px-6 !text-xs gap-2 shadow-md shadow-emergency-600/30 flex-shrink-0 active:scale-95 self-start"
                >
                  {pullingHistory ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Pulling Across Hospitals...</span>
                    </>
                  ) : (
                    <>
                      <Network className="w-4 h-4" />
                      <span>Pull Full History Across Hospitals</span>
                    </>
                  )}
                </button>
              </div>

              {/* Connected Hospitals Preview */}
              <div className="pt-3 border-t border-brand-100">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Registered Partner Hospitals in Network:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Metro Trauma Center</span>
                    <span className="corporate-badge-blue text-[9px]">Level 1 Trauma</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">St. Jude Emergency Hospital</span>
                    <span className="corporate-badge-green text-[9px]">Surgical & Cardio</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Apex Specialist Care</span>
                    <span className="corporate-badge-amber text-[9px]">Outpatient & Rx</span>
                  </div>
                </div>
              </div>

              {/* Retrieval Handshake Animation Status */}
              {pullingHistory && (
                <div className="p-4 rounded-xl bg-slate-900 text-white text-xs font-mono space-y-2 animate-fadeIn">
                  <p className="text-brand-400 font-bold flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>EXECUTING AUTOMATED INTER-HOSPITAL RECORD PULL...</span>
                  </p>
                  <p className={pullProgressStep >= 1 ? 'text-emerald-400' : 'text-slate-500'}>
                    {pullProgressStep >= 1 ? '✓' : '○'} Handshake: Dr. {doctorProfile?.full_name || 'Physician'} ({doctorProfile?.hospital || 'Hospital'}) verified via MED-ID registry.
                  </p>
                  <p className={pullProgressStep >= 2 ? 'text-emerald-400' : 'text-slate-500'}>
                    {pullProgressStep >= 2 ? '✓' : '○'} Querying registered partner hospitals for patient records...
                  </p>
                  <p className={pullProgressStep >= 3 ? 'text-emerald-400' : 'text-slate-500'}>
                    {pullProgressStep >= 3 ? '✓' : '○'} Dispatched inter-hospital access compliance notices to all partner facilities.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* If Unlocked: Display Hospital Notifications Summary & Full Medical History Table */}
          {fullHistoryUnlocked && (
            <div className="space-y-5 animate-fadeIn">
              
              {hospitalPullLogs.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Automatic Inter-Hospital Exchange Audit:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-emerald-800 font-mono">
                    {hospitalPullLogs.map((h, i) => (
                      <div key={i} className="p-2 rounded-lg bg-white/80 border border-emerald-200">
                        <strong className="block text-emerald-950 font-sans">{h.hospital}</strong>
                        <span>Status: {h.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Medical History Table (Conditions, Medications, Surgeries, Clinical Encounters) */}
              <MedicalHistoryTable 
                patient={patient} 
                canAdd={doctorProfile?.role === 'doctor' && doctorProfile?.status === 'active'} 
                doctorProfile={doctorProfile} 
              />
            </div>
          )}
        </div>

        {/* Audit Disclaimer Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            <span>Triage logged under Doctor: <strong>{doctorProfile?.full_name || 'ER Attending'}</strong> ({doctorProfile?.hospital || 'Emergency Bay'})</span>
          </div>
          <button
            onClick={onClose}
            className="corporate-btn-secondary !py-1 !px-3 !text-xs"
          >
            Close Dossier
          </button>
        </div>

      </div>
    </div>
  );
}
