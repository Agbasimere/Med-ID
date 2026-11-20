import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './components/LandingPage';
import DoctorDashboard from './components/DoctorDashboard';
import PatientDashboard from './components/PatientDashboard';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';
import PatientOnboardingWizard from './components/PatientOnboardingWizard';
import { getCurrentSession, signOutUser } from './lib/supabase';

export default function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing', 'doctor', 'patient', 'admin'
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({ role: 'patient', mode: 'signin' });
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingPatientDetails, setOnboardingPatientDetails] = useState(null);
  const [onboardingIntakeSaved, setOnboardingIntakeSaved] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const sessionData = await getCurrentSession();
      if (sessionData) {
        setCurrentUser(sessionData.user);
        setUserProfile(sessionData.profile);

        // Auto route to their role dashboard
        if (sessionData.profile?.role === 'doctor') {
          setCurrentView('doctor');
        } else if (sessionData.profile?.role === 'admin') {
          setCurrentView('admin');
        } else if (sessionData.profile?.role === 'patient') {
          setCurrentView('patient');
        }
      }
    } catch (e) {
      console.warn('Session check error:', e);
    }
  };

  const handleOpenAuth = (role = 'patient', mode = 'signin') => {
    setAuthModalConfig({ role, mode });
    setShowAuthModal(true);
  };

  const handleAuthSuccess = (user, profile, isNewPatientSignup = false, patientDetails = null, intakeSaved = false) => {
    setCurrentUser(user);
    setUserProfile(profile);

    if (isNewPatientSignup && profile?.role === 'patient') {
      setOnboardingPatientDetails(patientDetails);
      setOnboardingIntakeSaved(intakeSaved);
      setShowOnboardingWizard(true);
      setCurrentView('patient');
    } else {
      if (profile?.role === 'doctor') {
        setCurrentView('doctor');
      } else if (profile?.role === 'admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('patient');
      }
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCurrentUser(null);
    setUserProfile(null);
    setCurrentView('landing');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      
      {/* Main Navigation (Clean, role-aware, no public Supabase or portal tabs) */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenAuth={handleOpenAuth}
        onSignOut={handleSignOut}
      />

      {/* Main Viewport Router */}
      <main className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onOpenAuth={handleOpenAuth}
          />
        )}

        {currentView === 'doctor' && (
          <DoctorDashboard
            currentUser={currentUser}
            userProfile={userProfile}
            onOpenAuth={() => handleOpenAuth('doctor', 'signin')}
          />
        )}

        {currentView === 'patient' && (
          <PatientDashboard
            currentUser={currentUser}
            userProfile={userProfile}
            onOpenAuth={() => handleOpenAuth('patient', 'signin')}
          />
        )}

        {currentView === 'admin' && (
          <AdminDashboard
            currentUser={currentUser}
            userProfile={userProfile}
            onOpenAuth={() => handleOpenAuth('admin', 'signin')}
          />
        )}
      </main>

      {/* Footer */}
      <Footer setCurrentView={setCurrentView} />

      {/* Role-Based Auth Dialog (Patient or Doctor only) */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        initialRole={authModalConfig.role}
        initialMode={authModalConfig.mode}
      />

      {/* Patient Guided Onboarding Wizard (Step 1: Face verification, Step 2: Medical info) */}
      {showOnboardingWizard && currentUser && (
        <PatientOnboardingWizard
          currentUser={currentUser}
          initialPatientDetails={onboardingPatientDetails}
          intakeAlreadySaved={onboardingIntakeSaved}
          onComplete={() => {
            setShowOnboardingWizard(false);
            setOnboardingPatientDetails(null);
            setOnboardingIntakeSaved(false);
            setCurrentView('patient');
          }}
        />
      )}

    </div>
  );
}
