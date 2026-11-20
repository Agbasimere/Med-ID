import React, { useState } from 'react';
import { 
  X, 
  User, 
  Stethoscope, 
  Lock, 
  Mail, 
  Hospital, 
  AlertCircle, 
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { signUpUser, signInUser } from '../lib/supabase';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, initialRole = 'patient', initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode); // 'signin' or 'signup'
  const [role, setRole] = useState(initialRole); // 'patient' or 'doctor'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Doctor Fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [hospitalName, setHospitalName] = useState('');

  if (!isOpen) return null;

  const describeAuthError = (err) => {
    const code = String(err?.code || '').toLowerCase();
    const status = err?.status ? ` (HTTP ${err.status}${err.code ? `, ${err.code}` : ''})` : '';
    const fields = [err?.message, err?.error_description, err?.msg, err?.details, err?.hint]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim());
    const message = [...new Set(fields)].join(' — ');

    if (['user_already_exists', 'email_exists'].includes(code)) {
      return 'An account already exists for this email. Sign in instead.';
    }
    if (code === 'email_address_not_authorized') {
      return 'This address is valid, but Supabase’s built-in email service only sends to project team members. Configure custom SMTP in Supabase Auth, or test with an address already on the project team.';
    }
    if (code === 'email_address_invalid') {
      return 'The app accepts standard addresses such as admin@gmail.com. Supabase rejected this address; confirm there are no hidden spaces and check Supabase Auth logs and email settings.';
    }
    if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message)) {
      return 'Supabase has temporarily limited confirmation emails after repeated signup attempts. Stop retrying and wait for the project’s email limit to reset, then check Authentication → Users before trying again. Configure custom SMTP if you need more test emails.';
    }
    if (code.includes('password') || /password/i.test(message)) {
      return message || 'Password does not meet the Supabase project requirements.';
    }
    if (code.includes('email') || /email/i.test(message)) {
      return message || 'Check the email address and the Supabase Email provider settings.';
    }
    if (!message || message === '{}' || message === '[object Object]') {
      return `Supabase returned an empty authentication error${status}. Check Supabase Dashboard → Logs → Auth for the request details. If the user already appears under Authentication → Users, sign in with that account instead.`;
    }
    return `${message}${status}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const res = await signInUser({ email, password });
        onAuthSuccess(res.user, res.profile, false);
        onClose();
      } else {
        // Sign up (Patient or Doctor only)
        if (!fullName.trim()) throw new Error('Please enter your full name');
        
        let doctorDetails = {};
        if (role === 'doctor') {
          if (!licenseNumber.trim() || !hospitalName.trim()) {
            throw new Error('Doctor license number and hospital name are required.');
          }
          doctorDetails = {
            licenseNo: licenseNumber.trim(),
            hospital: hospitalName.trim()
          };
        }

        const res = await signUpUser({
          email,
          password,
          fullName,
          role,
          doctorDetails
        });

        if (!res.session) {
          setSuccessMsg('Your account was created. Confirm your email if prompted, then sign in to finish profile setup.');
          setMode('signin');
          return;
        }

        // Pass isNewSignup = true so a patient is guided into face verification & medical info
        onAuthSuccess(res.user, { role, full_name: fullName }, role === 'patient');
        onClose();
      }
    } catch (err) {
      console.error('Auth error:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        details: err?.details,
        hint: err?.hint
      });
      setErrorMsg(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="corporate-card max-w-md w-full p-6 sm:p-8 max-h-[92vh] overflow-y-auto relative shadow-2xl">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <span className="corporate-badge-blue text-[11px] mb-2">
            Secure Access
          </span>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {mode === 'signin' ? 'Sign In to Med ID' : 'Create Account'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'signin'
              ? 'Access emergency triage tools or your biometric profile.'
              : 'Register as a Patient or Emergency Doctor.'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => { setMode('signin'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Role Selector (ONLY Patient or Doctor - Admin removed) */}
        {mode === 'signup' && (
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Account Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('patient')}
                className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  role === 'patient'
                    ? 'border-brand-500 bg-brand-50/50 text-brand-900 ring-1 ring-brand-500'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <User className={`w-6 h-6 ${role === 'patient' ? 'text-brand-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold">Patient</span>
                <span className="text-[10px] text-slate-500">Citizen Biometrics</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  role === 'doctor'
                    ? 'border-emergency-500 bg-emergency-50/50 text-emergency-900 ring-1 ring-emergency-500'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <Stethoscope className={`w-6 h-6 ${role === 'doctor' ? 'text-emergency-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold">ER Doctor</span>
                <span className="text-[10px] text-slate-500">Trauma Bay Triage</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder={role === 'doctor' ? 'Dr. Elizabeth Chen' : 'Alexander Wright'}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="corporate-input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="corporate-input"
            />
            {mode === 'signup' && <p className="mt-1 text-[11px] text-slate-500">Use an address you can access; Supabase may send a confirmation link.</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="corporate-input"
            />
          </div>

          {/* Extra Fields for Doctors during sign up */}
          {mode === 'signup' && role === 'doctor' && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Hospital className="w-4 h-4 text-emergency-600" />
                <span>Doctor Credentials</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    License Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MD-94021"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className="corporate-input !py-1.5 !text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Hospital Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Metro Emergency"
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    className="corporate-input !py-1.5 !text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 shadow-md transition-all text-sm ${
              role === 'doctor' && mode === 'signup'
                ? 'bg-emergency-600 hover:bg-emergency-700 shadow-emergency-600/30'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In Securely' : 'Continue to Registration'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
