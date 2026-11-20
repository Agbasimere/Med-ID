import React, { useState, useEffect } from 'react';
import { 
  User, 
  Droplet, 
  AlertTriangle, 
  Heart, 
  FileText, 
  Camera, 
  ShieldCheck, 
  PhoneCall, 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  QrCode,
  Sparkles,
  RefreshCw,
  Mail,
  Bell,
  Fingerprint,
  Activity
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  getPatientData, 
  updatePatientProfile, 
  getPatientNotifications 
} from '../lib/supabase';
import FaceEnrollmentModal from './FaceEnrollmentModal';
import FingerprintEnrollmentModal from './FingerprintEnrollmentModal';
import MedicalHistoryTable from './MedicalHistoryTable';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspacePageHeader from './WorkspacePageHeader';

export default function PatientDashboard({ currentUser, userProfile, onOpenAuth }) {
  const [activePage, setActivePage] = useState('overview');
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Form State matching User's Schema
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [bloodType, setBloodType] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [emergName, setEmergName] = useState('');
  const [emergPhone, setEmergPhone] = useState('');
  const [emergEmail, setEmergEmail] = useState('');

  useEffect(() => {
    loadPatientInfo();
  }, [currentUser]);

  const loadPatientInfo = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getPatientData(currentUser.id);
      if (data) {
        setPatient(data);
        setFullName(data.full_name || userProfile?.full_name || '');
        setDob(data.dob || '');
        setBloodType(data.blood_type || 'O+');
        setAllergies(data.allergies || '');
        setConditions(data.conditions || '');
        setMedications(data.medications || '');
        setEmergName(data.emerg_name || '');
        setEmergPhone(data.emerg_phone || '');
        setEmergEmail(data.emerg_email || '');
      }

      // Load ER notifications sent to this patient
      const notifs = await getPatientNotifications(currentUser.id);
      setNotifications(notifs);
    } catch (err) {
      console.error('Error loading patient info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMedicalData = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    setFeedbackMsg(null);

    try {
      const updated = await updatePatientProfile(currentUser.id, {
        full_name: fullName,
        dob: dob,
        emerg_name: emergName,
        emerg_phone: emergPhone,
        emerg_email: emergEmail
      });

      setPatient(prev => ({ ...prev, ...updated, full_name: fullName }));
      setFeedbackMsg({ type: 'success', text: 'Basic profile and emergency contact saved.' });
      confetti({ particleCount: 30, spread: 60 });
    } catch (err) {
      console.error('Save error:', err);
      setFeedbackMsg({ type: 'error', text: 'Failed to update profile: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 text-brand-600 mx-auto flex items-center justify-center">
          <User className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Patient Medical Portal</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-md mx-auto">
            Please sign in or create a patient account to enroll your emergency facial biometrics, blood type, and emergency contact.
          </p>
        </div>
        <button
          onClick={onOpenAuth}
          className="corporate-btn-brand !py-3 !px-6"
        >
          Sign In / Register as Patient
        </button>
      </div>
    );
  }

  const hasFaceBiometrics = Boolean(patient?.descriptor?.vector || Array.isArray(patient?.descriptor));
  const hasFingerprint = Boolean(patient?.descriptor?.fingerprint);
  const photoUrl = patient?.descriptor?.photo || null;
  const fpData = patient?.descriptor?.fingerprint || null;
  const pageMeta = {
    overview: ['Overview', 'A quick view of your emergency profile and biometric enrollment status.'],
    profile: ['Basic profile', 'Keep your identity and emergency contact details up to date.'],
    history: ['Medical record', 'Review your medical history in one secure, structured record.'],
    notifications: ['Notifications', 'Review emergency notifications sent to your listed contacts.']
  }[activePage];

  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
      <WorkspaceSidebar accountType="Patient" userProfile={userProfile} currentUser={currentUser} activeKey={activePage} onNavigate={setActivePage} groups={[
        { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: Activity }] },
        { label: 'Account', items: [{ key: 'profile', label: 'Basic profile', icon: User }, { key: 'history', label: 'Medical record', icon: FileText }, { key: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.length }] }
      ]} />

      <div className="min-w-0 flex-1 space-y-7">
      <WorkspacePageHeader accountType="Patient portal" section={activePage === 'overview' ? 'Overview' : activePage === 'profile' || activePage === 'notifications' ? 'Account' : 'Health records'} title={pageMeta[0]} description={pageMeta[1]} />
      {activePage === 'overview' && <>
      <section id="patient-overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Profile status</span><ShieldCheck className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-lg font-bold capitalize text-slate-900">{userProfile?.status || 'active'}</p><p className="text-[11px] text-slate-500">Personal details are editable</p></div>
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Biometric access</span><Fingerprint className="h-4 w-4 text-brand-600" /></div><p className="mt-2 text-lg font-bold text-slate-900">{Number(hasFaceBiometrics) + Number(hasFingerprint)} of 2</p><p className="text-[11px] text-slate-500">Face and device credential</p></div>
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Emergency alerts</span><Bell className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-lg font-bold text-slate-900">{notifications.length}</p><p className="text-[11px] text-slate-500">Notifications on your account</p></div>
      </section>
      
      {/* Top Banner: Dual-Biometrics Overview (Face & Fingerprint) */}
      <div className="corporate-card p-6 sm:p-8 bg-gradient-to-r from-white via-slate-50 to-brand-50/40 border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 border-2 border-brand-500/30 flex-shrink-0 shadow-md">
              {photoUrl ? (
                <img 
                  src={photoUrl} 
                  alt={fullName} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[9px] font-bold">NO FACE</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {fullName || 'Patient Profile'}
                </h2>
                
                {/* Face Badge */}
                {hasFaceBiometrics ? (
                  <span className="corporate-badge-green text-[10px] gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Face ID Active
                  </span>
                ) : (
                  <span className="corporate-badge-amber text-[10px] gap-1 font-bold animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    Face Pending
                  </span>
                )}

                {/* Fingerprint Badge */}
                {hasFingerprint ? (
                  <span className="corporate-badge-blue text-[10px] gap-1 font-bold">
                    <Fingerprint className="w-3 h-3 text-brand-600" />
                    Fingerprint Registered ({fpData?.finger})
                  </span>
                ) : (
                  <span className="corporate-badge-amber text-[10px] gap-1 font-bold">
                    <Fingerprint className="w-3 h-3" />
                    Fingerprint Unregistered
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1.5">
                <span>Blood Type: <strong className="text-emergency-600 font-bold">{bloodType}</strong></span>
                <span>•</span>
                <span>DOB: <strong>{dob || 'Not set'}</strong></span>
                <span>•</span>
                <span>Next of Kin: <strong>{emergName || 'Not configured'}</strong></span>
              </div>
            </div>
          </div>

          {/* Biometric Enrollment Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowFaceModal(true)}
              className="corporate-btn-secondary !py-2.5 !px-3.5 !text-xs gap-1.5 border border-slate-200"
            >
              <Camera className="w-4 h-4 text-brand-600" />
              <span>{hasFaceBiometrics ? 'Re-scan Face ID' : 'Enroll Face ID'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFingerprintModal(true)}
              className="corporate-btn-brand !py-2.5 !px-4 !text-xs gap-1.5 shadow-sm shadow-brand-500/20"
            >
              <Fingerprint className="w-4 h-4" />
              <span>{hasFingerprint ? 'Update Fingerprint' : 'Enroll Fingerprint'}</span>
            </button>
          </div>

        </div>
      </div>
      </>}

      {/* Save Notification */}
      {activePage === 'profile' && <>
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span className="font-semibold">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Editable profile details: clinical history is staff-managed */}
      <form id="patient-profile" onSubmit={handleSaveMedicalData} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Vitals, Allergies, Conditions (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Identity & Blood Type */}
          <div className="corporate-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
              <Droplet className="w-4 h-4 text-emergency-600" />
              <span>Basic Profile Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="corporate-input"
                  placeholder="Alexander Wright"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="corporate-input"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Emergency Contact & Card Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Emergency Contact Box */}
          <div className="corporate-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
              <PhoneCall className="w-4 h-4 text-emerald-600" />
              <span>Emergency Next of Kin</span>
            </div>
            <p className="text-xs text-slate-500">
              ER physicians will notify this contact immediately upon identifying you in the trauma bay.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Miller (Spouse)"
                  value={emergName}
                  onChange={(e) => setEmergName(e.target.value)}
                  className="corporate-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Mobile Phone
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +1 (555) 234-8911"
                  value={emergPhone}
                  onChange={(e) => setEmergPhone(e.target.value)}
                  className="corporate-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  placeholder="e.g. sarah.m@example.com"
                  value={emergEmail}
                  onChange={(e) => setEmergEmail(e.target.value)}
                  className="corporate-input"
                />
              </div>
            </div>
          </div>

          {/* Digital Emergency Med-ID Card Preview */}
          <div className="corporate-card relative overflow-hidden border border-slate-200 bg-gradient-to-br from-white via-white to-brand-50/60 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 font-bold text-xs text-brand-700">
                  MED
                </div>
                <span className="font-extrabold text-xs tracking-wider uppercase text-slate-700">
                  MED-ID DIGITAL BADGE
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-brand-700">
                EMERGENCY PROFILE
              </span>
            </div>

            <div className="flex items-center gap-4 py-2">
              <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex-shrink-0">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-xs">
                    ID
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">{fullName || 'Patient Name'}</h4>
                <p className="text-xs font-mono text-brand-700 font-bold">Record ID: {currentUser.id.slice(0, 8)}...</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                    BLOOD: {bloodType}
                  </span>
                  {hasFingerprint && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      DEVICE CREDENTIAL
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 mt-3 pt-3 border-t border-slate-200 leading-relaxed">
              This profile helps authorized clinicians identify you and review the emergency information you have provided.
            </p>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full corporate-btn-brand !py-3.5 !text-sm gap-2 shadow-lg shadow-brand-500/25"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Profile Details...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Basic Profile Details</span>
              </>
            )}
          </button>

        </div>

      </form>
      </>}

      {activePage === 'history' &&
      <div id="patient-history"><MedicalHistoryTable patient={patient || {
        id: currentUser.id, full_name: fullName, dob, blood_type: bloodType,
        allergies, conditions, medications
      }} /></div>
      }

      {/* Notifications Table */}
      {activePage === 'notifications' &&
      <div id="patient-notifications" className="corporate-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Emergency alert records</h3>
              <p className="text-xs text-slate-500">
                Alerts recorded when an authorized care team reviews your record.
              </p>
            </div>
          </div>
          <span className="corporate-badge-blue text-[10px]">
            {notifications.length} Alerts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Message Dispatched to Family</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-slate-800">
                      {n.message}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-400 italic">
                    No emergency notifications recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      }

      {/* Face Enrollment Modal */}
      <FaceEnrollmentModal
        isOpen={showFaceModal}
        onClose={() => setShowFaceModal(false)}
        patientId={currentUser.id}
        onEnrollmentSuccess={(updatedPatient) => {
          setPatient(prev => ({ ...prev, ...updatedPatient }));
          setFeedbackMsg({ type: 'success', text: 'Facial biometrics updated!' });
        }}
      />

      {/* Fingerprint Enrollment Modal */}
      <FingerprintEnrollmentModal
        isOpen={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
        patientId={currentUser.id}
        patientName={fullName || userProfile?.full_name || 'Patient'}
        patientEmail={currentUser?.email || 'patient@medid.org'}
        onSuccess={(fpTemplate) => {
          setPatient(prev => ({
            ...prev,
            descriptor: { ...(prev?.descriptor || {}), fingerprint: fpTemplate }
          }));
          setFeedbackMsg({ type: 'success', text: `Fingerprint enrolled successfully! (${fpTemplate.finger})` });
        }}
      />
      </div>
    </div>
  );
}

