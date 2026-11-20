import React, { useState } from 'react';
import { 
  X,
  PhoneCall,
  ShieldCheck,
  Send,
  CheckCircle2,
  Droplet,
  MessageCircle
} from 'lucide-react';
import { dispatchEmergencyNotification, logAuditEntry } from '../lib/supabase';
import { buildEmergencyWhatsAppUrl } from '../lib/whatsapp';
import MedicalHistoryTable from './MedicalHistoryTable';

export default function EmergencyDossierModal({ 
  isOpen, 
  onClose, 
  patient, 
  doctorProfile 
}) {
  const [dispatching, setDispatching] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  if (!isOpen || !patient) return null;

  const photoUrl = patient.descriptor?.photo || null;
  const whatsappUrl = buildEmergencyWhatsAppUrl({ phone: patient.emerg_phone, patient, senderProfile: doctorProfile });

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
            PATIENT RECORD
          </span>
          <span className="text-xs text-slate-500 font-mono">
            UUID: {patient.id?.slice(0, 8)}...
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
                <span>Email: <strong>{patient.email || 'N/A'}</strong></span>
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
                {patient.blood_type || 'UNKNOWN'}
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

        <div className="my-5">
          <MedicalHistoryTable patient={patient} canAdd={doctorProfile?.role === 'doctor' && doctorProfile?.status === 'active'} doctorProfile={doctorProfile} />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-3">
          <p><span className="font-semibold text-slate-500">Next of kin</span><br />{patient.emerg_name || 'Not provided'}</p>
          <p><span className="font-semibold text-slate-500">Phone</span><br />{patient.emerg_phone || 'Not provided'}</p>
          <p><span className="font-semibold text-slate-500">Email</span><br />{patient.emerg_email || 'Not provided'}</p>
        </div>

        {/* Loved Ones Immediate Dispatcher */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="next-of-kin-title">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-brand-600" />
                <h3 id="next-of-kin-title" className="text-sm font-bold uppercase tracking-wide text-slate-900">Notify next of kin</h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">Prepare an emergency WhatsApp message with the hospital and care-team details.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={() => logAuditEntry({ action: 'WHATSAPP_ALERT_PREPARED', targetId: patient.id, details: `Opened a pre-filled WhatsApp emergency message for ${patient.emerg_name || 'next of kin'}.` })} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100">
                <MessageCircle className="h-4 w-4" /><span>Open WhatsApp</span>
              </a> : <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">Add a valid contact phone to enable WhatsApp</span>}
              <button
                type="button"
                onClick={handleDispatchNotification}
                disabled={dispatching || alertSent}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${alertSent ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-700'}`}
              >
                {alertSent ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                <span>{alertSent ? 'Alert recorded' : dispatching ? 'Recording...' : 'Record alert in MED-ID'}</span>
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{patient.emerg_name || 'Next of kin not provided'}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{patient.emerg_phone || 'No phone number'}{patient.emerg_email ? ` · ${patient.emerg_email}` : ''}</p>
            </div>
            <p className="max-w-lg text-[11px] leading-relaxed text-slate-500">WhatsApp opens with a pre-filled message. Review it and tap Send in WhatsApp to deliver it.</p>
          </div>
        </section>

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
