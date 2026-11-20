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
import PatientOnboardingWizard from './PatientOnboardingWizard';

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 'Not provided';
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return 'Not provided';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? `${age} years` : 'Not provided';
}

export default function PatientDashboard({ currentUser, userProfile, onOpenAuth }) {
  const [activePage, setActivePage] = useState('overview');
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [showIntakeWizard, setShowIntakeWizard] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Form State matching User's Schema
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('');
  const [genotype, setGenotype] = useState('');
  const [nationality, setNationality] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [bloodType, setBloodType] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [surgeries, setSurgeries] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [emergName, setEmergName] = useState('');
  const [emergPhone, setEmergPhone] = useState('');
  const [emergEmail, setEmergEmail] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

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
        if (!data.intake_completed_at && !data.descriptor) setShowIntakeWizard(true);
        setFullName(data.full_name || userProfile?.full_name || '');
        setDob(data.dob || '');
        setSex(data.sex || '');
        setGenotype(data.genotype || '');
        setNationality(data.nationality || '');
        setHomeAddress(data.home_address || '');
        setBloodType(data.blood_type || data.blood_group || 'O+');
        setAllergies(data.allergies || '');
        setConditions(data.conditions || '');
        setMedications(data.medications || '');
        setSurgeries(data.surgeries || '');
        setMedicalHistory(data.medical_history || '');
        setEmergName(data.emerg_name || '');
        setEmergPhone(data.emerg_phone || '');
        setEmergEmail(data.emerg_email || '');
        setWhatsappOptIn(Boolean(data.emerg_whatsapp_opt_in));
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
        sex,
        blood_type: bloodType,
        genotype,
        nationality,
        home_address: homeAddress,
        allergies,
        conditions,
        medications,
        surgeries,
        medical_history: medicalHistory,
        emerg_name: emergName,
        emerg_phone: emergPhone,
        emerg_email: emergEmail,
        emerg_whatsapp_opt_in: whatsappOptIn
      });

      setPatient(prev => ({ 
        ...prev, 
        ...updated, 
        full_name: fullName,
        blood_type: bloodType,
        conditions,
        allergies,
        medications,
        surgeries,
        medical_history: medicalHistory
      }));
      setFeedbackMsg({ type: 'success', text: 'All basic profile details and medical information have been saved to Supabase!' });
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
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:px-8">
      <WorkspaceSidebar accountType="Patient" userProfile={userProfile} currentUser={currentUser} activeKey={activePage} onNavigate={setActivePage} groups={[
        { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: Activity }] },
        { label: 'Account', items: [{ key: 'profile', label: 'Basic profile', icon: User }, { key: 'history', label: 'Medical record', icon: FileText }, { key: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.length }] }
      ]} />

      <div className="min-w-0 flex-1 space-y-7">
      <WorkspacePageHeader accountType="Patient portal" section={activePage === 'overview' ? 'Overview' : activePage === 'profile' || activePage === 'notifications' ? 'Account' : 'Health records'} title={pageMeta[0]} description={pageMeta[1]} />
      {activePage === 'overview' && <>
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
            <section id="patient-overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Profile status</span><ShieldCheck className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-lg font-bold capitalize text-slate-900">{userProfile?.status || 'active'}</p><p className="text-[11px] text-slate-500">Personal details are editable</p></div>
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Biometric access</span><Fingerprint className="h-4 w-4 text-brand-600" /></div><p className="mt-2 text-lg font-bold text-slate-900">{Number(hasFaceBiometrics) + Number(hasFingerprint)} of 2</p><p className="text-[11px] text-slate-500">Face and device credential</p></div>
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Emergency alerts</span><Bell className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-lg font-bold text-slate-900">{notifications.length}</p><p className="text-[11px] text-slate-500">Notifications on your account</p></div>
      </section>
      </>}

      {/* Save Notification */}
      {activePage === 'profile' && <>
      <section className="corporate-card grid grid-cols-1 gap-4 border-l-4 border-l-brand-600 bg-gradient-to-r from-white to-brand-50/50 p-5 sm:grid-cols-2 xl:grid-cols-4 xl:items-center">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">Emergency profile</p><p className="mt-1 text-sm font-semibold text-slate-900">MED-ID digital identity</p></div>
        <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Patient</p><p className="mt-1 text-sm font-bold text-slate-900">{fullName || 'Patient Name'}</p></div>
        <div><p className="text-[10px] uppercase tracking-wide text-slate-500">MED-ID number</p><p className="mt-1 break-all font-mono text-sm font-semibold text-brand-700">{patient?.med_id_number || `MED-${currentUser.id.replaceAll('-', '').toUpperCase()}`}</p></div>
        <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Blood group</p><p className="mt-1 text-sm font-bold text-rose-700">{bloodType}</p></div>
      </section>
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
          <div className="corporate-card space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
              <Droplet className="w-4 h-4 text-emergency-600" />
              <span>Basic Profile Information</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Age</label>
                <input type="text" value={calculateAge(dob)} readOnly className="corporate-input bg-slate-50" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Sex</label>
                <select value={sex} onChange={(e) => setSex(e.target.value)} className="corporate-input">
                  <option value="">Not provided</option><option value="Female">Female</option><option value="Male">Male</option><option value="Intersex">Intersex</option><option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Blood group</label>
                <select 
                  value={bloodType} 
                  onChange={(e) => setBloodType(e.target.value)} 
                  className="corporate-input font-bold text-emergency-700"
                >
                  {['A+','A−','B+','B−','AB+','AB−','O+','O−','Unknown'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Genotype</label>
                <input type="text" value={genotype} onChange={(e) => setGenotype(e.target.value)} maxLength={20} className="corporate-input" placeholder="e.g. AA, AS" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nationality</label>
                <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} maxLength={100} className="corporate-input" />
              </div>

              <div className="sm:col-span-2 xl:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Home address</label>
                <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} maxLength={500} className="corporate-input" placeholder="Street, city, state/region, country" />
              </div>
            </div>
          </div>

          <section className="corporate-card space-y-4 p-4 sm:p-6" aria-labelledby="self-reported-history-title">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="self-reported-history-title" className="text-sm font-bold text-slate-900">Patient-Reported Medical Information</h3>
                <p className="mt-1 text-xs text-slate-500">Edit your allergies, conditions, and treatment history. Click Save below to update your backend records.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Existing Conditions</label>
                <textarea 
                  value={conditions} 
                  onChange={(e) => setConditions(e.target.value)} 
                  rows={2} 
                  placeholder="e.g. Type 1 Diabetes, Asthma, Hypertension" 
                  className="corporate-input" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Allergies and Reactions</label>
                <textarea 
                  value={allergies} 
                  onChange={(e) => setAllergies(e.target.value)} 
                  rows={2} 
                  placeholder="e.g. Penicillin (Anaphylaxis), Peanuts, Shellfish" 
                  className="corporate-input" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Medications</label>
                <textarea 
                  value={medications} 
                  onChange={(e) => setMedications(e.target.value)} 
                  rows={2} 
                  placeholder="e.g. Insulin Glargine 20 units daily, Albuterol inhaler" 
                  className="corporate-input" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Previous Surgeries & Major Treatments</label>
                <textarea 
                  value={surgeries} 
                  onChange={(e) => setSurgeries(e.target.value)} 
                  rows={2} 
                  placeholder="e.g. Appendectomy (2021, St. Jude), Knee Arthroscopy (2023)" 
                  className="corporate-input" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Important Medical History</label>
                <textarea 
                  value={medicalHistory} 
                  onChange={(e) => setMedicalHistory(e.target.value)} 
                  rows={2} 
                  placeholder="e.g. Previous ICU admissions, blood transfusions, fainting episodes" 
                  className="corporate-input" 
                />
              </div>
            </div>
          </section>

        </div>

        {/* Right Column: Emergency Contact & Card Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Emergency Contact Box */}
          <div className="corporate-card space-y-4 p-4 sm:p-6">
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
                  Contact Mobile Phone(s)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +1 (555) 234-8911"
                  value={emergPhone}
                  onChange={(e) => setEmergPhone(e.target.value)}
                  className="corporate-input"
                />
                <p className="mt-1 text-[10px] text-slate-500">Add multiple numbers separated by commas or semicolons.</p>
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
              <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 sm:col-span-2">
                <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} className="mt-0.5 accent-brand-700" />
                <span>I confirm my emergency contacts have agreed to receive WhatsApp emergency alerts from my care team.</span>
              </label>
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
              <span className="text-[10px] font-mono font-bold text-brand-700">PATIENT IDENTIFICATION</span>
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
                <p className="break-all text-xs font-mono font-bold text-brand-700">MED-ID: {patient?.med_id_number || `MED-${currentUser.id.replaceAll('-', '').toUpperCase()}`}</p>
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
        allergies, conditions, medications, patient_reported: true
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
      {showIntakeWizard && currentUser && <PatientOnboardingWizard
        currentUser={currentUser}
        onComplete={() => {
          setShowIntakeWizard(false);
          loadPatientInfo();
        }}
      />}
      </div>
    </div>
  );
}

