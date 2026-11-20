import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Stethoscope, 
  Activity, 
  Search, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  PhoneCall, 
  Database, 
  Lock, 
  Download, 
  ExternalLink,
  ChevronRight,
  Eye,
  UserCheck,
  Zap,
  Sliders,
  Check,
  Droplet,
  Bell,
  MessageCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  getAdminOverviewData, 
  updateProfileStatus, 
  updateProfileRole, 
  logAuditEntry,
  supabase 
} from '../lib/supabase';
import EmergencyDossierModal from './EmergencyDossierModal';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspacePageHeader from './WorkspacePageHeader';
import { buildEmergencyWhatsAppUrl } from '../lib/whatsapp';

export default function AdminDashboard({ currentUser, userProfile, onOpenAuth }) {
  const [data, setData] = useState({
    profiles: [],
    patients: [],
    doctors: [],
    auditLogs: [],
    notifications: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'users', 'doctors', 'audit', 'notifications'
  const [searchFilter, setSearchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Dossier view
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDossier, setShowDossier] = useState(false);

  // Seeding feedback
  const [seeding, setSeeding] = useState(false);
  const [seedSuccessMsg, setSeedSuccessMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const overview = await getAdminOverviewData();
    if (overview) {
      setData(overview);
    }
    setLoading(false);
  };

  const handleToggleDoctorStatus = async (profileId, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await updateProfileStatus(profileId, nextStatus);
      await loadData();
    } catch (e) {
      alert('Failed to update doctor status: ' + e.message);
    }
  };

  const handleSetRole = async (profileId, newRole) => {
    try {
      await updateProfileRole(profileId, newRole);
      await loadData();
    } catch (e) {
      alert('Failed to update role: ' + e.message);
    }
  };

  // Seed sample patients matching user's exact schema
  const handleSeedDemoData = async () => {
    const client = supabase.client;
    if (!client) {
      alert('Supabase is not configured yet. Please configure your keys first.');
      return;
    }

    setSeeding(true);
    setSeedSuccessMsg('');

    try {
      const demoList = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          full_name: 'Alexander J. Wright',
          email: 'alex.wright@demo-medid.org',
          dob: '1989-07-22',
          blood_type: 'O-',
          allergies: 'Penicillin (Anaphylaxis Risk), Latex',
          conditions: 'Type 1 Diabetes (Insulin Dependent), Mild Asthma',
          medications: 'Insulin Glargine, Ventolin Inhaler',
          emerg_name: 'Sarah Wright (Spouse)',
          emerg_phone: '+1 (555) 234-8911',
          emerg_email: 'sarah.w@example.com',
          photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          full_name: 'Elena Rostova',
          email: 'elena.rostova@demo-medid.org',
          dob: '1994-03-14',
          blood_type: 'A+',
          allergies: 'Sulfa Drugs, Cephalosporins',
          conditions: 'Cardiac Arrhythmia',
          medications: 'Metoprolol 25mg',
          emerg_name: 'Victor Rostov (Father)',
          emerg_phone: '+1 (555) 912-4029',
          emerg_email: 'victor.r@example.com',
          photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          full_name: 'Marcus Vance',
          email: 'marcus.vance@demo-medid.org',
          dob: '1978-11-05',
          blood_type: 'B+',
          allergies: 'Peanuts (Severe), Shellfish',
          conditions: 'Hypertension, Sleep Apnea',
          medications: 'Lisinopril 10mg',
          emerg_name: 'Chloe Vance (Daughter)',
          emerg_phone: '+1 (555) 431-8890',
          emerg_email: 'chloe.v@example.com',
          photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80'
        }
      ];

      for (const item of demoList) {
        // Upsert profile
        await client.from('profiles').upsert({
          id: item.id,
          email: item.email,
          full_name: item.full_name,
          role: 'patient',
          status: 'active'
        });

        // Upsert patient
        await client.from('patients').upsert({
          id: item.id,
          dob: item.dob,
          blood_type: item.blood_type,
          allergies: item.allergies,
          conditions: item.conditions,
          medications: item.medications,
          emerg_name: item.emerg_name,
          emerg_phone: item.emerg_phone,
          emerg_email: item.emerg_email,
          descriptor: { photo: item.photo, vector: null }
        });
      }

      await loadData();
      setSeedSuccessMsg('3 Realistic Demo Patients successfully seeded into your Supabase database!');
      confetti({ particleCount: 50, spread: 70 });
    } catch (err) {
      console.error('Seeding error:', err);
      alert('Error seeding demo data: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // CSV Export for Compliance
  const handleExportAuditLogs = () => {
    if (!data.auditLogs || data.auditLogs.length === 0) {
      alert('No audit logs available to export.');
      return;
    }
    const headers = ['ID', 'Timestamp', 'Actor Email', 'Action', 'Target ID', 'Details'];
    const rows = data.auditLogs.map(l => [
      l.id,
      new Date(l.created_at).toISOString(),
      `"${l.actor_email || ''}"`,
      `"${l.action}"`,
      `"${l.target_id || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medid_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredProfiles = data.profiles.filter(p => {
    const matchesSearch = (p.full_name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
                          (p.email || '').toLowerCase().includes(searchFilter.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || p.role === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });
  const adminPageMeta = {
    overview: ['Operations overview', 'Monitor enrollment, credentialing, emergency alerts, and system activity.'],
    users: ['Patient and staff accounts', 'Search accounts, review role assignments, and inspect patient records.'],
    doctors: ['Doctor credentials', 'Review hospital affiliation, license details, and physician clearance.'],
    audit: ['Audit activity', 'Review and export recorded access and medical record activity.'],
    notifications: ['Emergency alerts', 'Review notifications sent to patient emergency contacts.']
  }[activeTab];

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:px-8">
      <WorkspaceSidebar accountType="Administrator" userProfile={userProfile} currentUser={currentUser} activeKey={activeTab} onNavigate={setActiveTab} groups={[
        { label: 'Administration', items: [{ key: 'overview', label: 'Overview', icon: Activity }, { key: 'users', label: 'Accounts', icon: Users, badge: data.profiles.length }, { key: 'doctors', label: 'Doctor credentials', icon: Stethoscope, badge: data.doctors.length }] },
        { label: 'Account', items: [{ key: 'audit', label: 'Audit activity', icon: ShieldCheck, badge: data.auditLogs.length }, { key: 'notifications', label: 'Emergency alerts', icon: Bell, badge: data.notifications.length }] }
      ]} />
      <div className="min-w-0 flex-1 space-y-7">
      
      <WorkspacePageHeader accountType="Admin console" section="System management" title={adminPageMeta[0]} description={adminPageMeta[1]} actions={<>
          <button
            onClick={handleSeedDemoData}
            disabled={seeding}
            className="corporate-btn-secondary !py-2 !px-3.5 !text-xs gap-1.5"
            title="Seed 3 sample patients with realistic allergies and blood types"
          >
            <Database className="w-3.5 h-3.5 text-brand-600" />
            <span>{seeding ? 'Seeding...' : 'Seed Demo Patients'}</span>
          </button>

          <button
            onClick={handleExportAuditLogs}
            className="corporate-btn-primary !py-2 !px-3.5 !text-xs gap-1.5"
            title="Download Audit Report CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Refresh All Telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
      </>} />

      {/* Seed Success Banner */}
      {seedSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{seedSuccessMsg}</span>
          </div>
          <button onClick={() => setSeedSuccessMsg('')} className="text-slate-400 hover:text-slate-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Strip */}
      {activeTab === 'overview' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 sm:gap-4">
        
        <div className="corporate-card p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Enrolled Patients</span>
            <Users className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data.patients.length}
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">
            {data.patients.filter(p => p.descriptor).length} with Biometrics Active
          </span>
        </div>

        <div className="corporate-card p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>ER Physicians</span>
            <Stethoscope className="w-4 h-4 text-emergency-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data.doctors.length}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            {data.doctors.filter(d => d.status === 'active').length} Active & Cleared
          </span>
        </div>

        <div className="corporate-card p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Audit Entries</span>
            <Activity className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data.auditLogs.length}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Immutable Activity Log
          </span>
        </div>

        <div className="corporate-card p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Emergency Alerts</span>
            <PhoneCall className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {data.notifications.length}
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">
            Sent to Loved Ones
          </span>
        </div>

        <div className="corporate-card p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Total Profiles</span>
            <ShieldCheck className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data.profiles.length}
          </div>
          <span className="text-[10px] text-brand-600 font-semibold">
            Role-Based Access
          </span>
        </div>

      </div>}

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Live Audit Log Stream */}
            <div className="corporate-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emergency-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Recent System & Scan Audit Stream
                  </h3>
                </div>
                <span className="corporate-badge-red text-[10px] animate-pulse">Live</span>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {data.auditLogs.slice(0, 8).map((log) => (
                  <div 
                    key={log.id} 
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{log.action}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{log.actor_email}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                        {log.details}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {data.auditLogs.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    No audit records logged yet.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Notifications Monitor */}
            <div className="corporate-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Emergency alert records
                  </h3>
                </div>
              <span className="corporate-badge-green text-[10px]">{data.notifications.length} Recorded</span>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {data.notifications.slice(0, 8).map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-mono text-[10px]">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                      <span className="text-emerald-600 font-bold text-[10px]">
                        ✓ Dispatched
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 italic">
                      "{n.message}"
                    </p>
                  </div>
                ))}
                {data.notifications.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    No emergency notifications dispatched yet.
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: ALL USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="corporate-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search user by name or email..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="corporate-input !py-1.5 !text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="corporate-input !py-1.5 !text-xs !w-auto"
              >
                <option value="ALL">All Roles</option>
                <option value="PATIENT">Patients</option>
                <option value="DOCTOR">ER Doctors</option>
                <option value="ADMIN">Admins</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Biometrics</th>
                  <th className="py-2.5 px-3">Joined</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProfiles.map((p) => {
                  const pat = data.patients.find(pt => pt.id === p.id);
                  const hasBio = Boolean(pat?.descriptor);
                  const whatsappUrl = pat ? buildEmergencyWhatsAppUrl({ phone: pat.emerg_phone, patient: { ...pat, full_name: p.full_name }, senderProfile: { ...userProfile, role: 'admin' } }) : '';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-600">
                          {p.full_name ? p.full_name[0] : 'U'}
                        </div>
                        <span>{p.full_name || 'User'}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                        {p.email}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          p.role === 'doctor'
                            ? 'bg-emergency-50 text-emergency-700 border border-emergency-200'
                            : p.role === 'admin'
                            ? 'bg-slate-800 text-white'
                            : 'bg-brand-50 text-brand-700 border border-brand-200'
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          p.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {p.role === 'patient' ? (
                          hasBio ? (
                            <span className="corporate-badge-green text-[10px]">
                              ✓ Enrolled
                            </span>
                          ) : (
                            <span className="corporate-badge-amber text-[10px]">
                              Pending
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[10px]">N/A (Staff)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {pat && (
                          <div className="flex items-center justify-end gap-3">
                            {whatsappUrl && <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => logAuditEntry({ action: 'WHATSAPP_ALERT_PREPARED', targetId: p.id, details: `Admin opened a pre-filled WhatsApp emergency message for ${pat.emerg_name || 'next of kin'}.` })}
                              title={`Prepare a WhatsApp emergency message for ${pat.emerg_name || 'next of kin'}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                            </a>}
                            <button
                              onClick={() => {
                                setSelectedPatient({ ...pat, full_name: p.full_name, email: p.email });
                                setShowDossier(true);
                              }}
                              className="text-brand-600 hover:text-brand-800 font-semibold"
                            >
                              Inspect
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DOCTOR VERIFICATION */}
      {activeTab === 'doctors' && (
        <div className="corporate-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Hospital Physician Credentialing</h3>
              <p className="text-xs text-slate-500">
                Review doctors and update clearance status between <code>active</code>, <code>pending</code>, and <code>suspended</code>.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Doctor Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">License #</th>
                  <th className="py-2.5 px-3">Hospital / Facility</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.doctors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {d.full_name}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {d.email}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {d.license_no || 'MD-ON-DUTY'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {d.hospital || 'Metro Trauma Center'}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        d.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : d.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleToggleDoctorStatus(d.id, d.status)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                          d.status === 'active'
                            ? 'text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {d.status === 'active' ? 'Suspend Clearance' : 'Approve Doctor'}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.doctors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                      No doctors registered yet. Register as an ER Doctor from the Auth page!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FORENSIC AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="corporate-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Forensic Audit Log (audit_logs table)</h3>
              <p className="text-xs text-slate-500">
                Timestamped audit records of logins, biometric registrations, and ER facial scans.
              </p>
            </div>
            <button
              onClick={handleExportAuditLogs}
              className="corporate-btn-secondary !py-1 !px-2.5 !text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">ID & Time</th>
                  <th className="py-2.5 px-3">Actor Email</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.auditLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      <div>{new Date(l.created_at).toLocaleString()}</div>
                      <div className="text-[9px] text-slate-400">ID: {l.id}</div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {l.actor_email}
                    </td>
                    <td className="py-3 px-3">
                      <span className="corporate-badge-blue text-[10px] font-bold">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px] max-w-md">
                      {l.details}
                    </td>
                  </tr>
                ))}
                {data.auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                      No audit entries recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="corporate-card p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Emergency alert records</h3>
            <p className="text-xs text-slate-500">
              MED-ID records of emergency alerts. WhatsApp delivery is completed by the sender in WhatsApp.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Patient UUID</th>
                  <th className="py-2.5 px-3">Doctor UUID</th>
                  <th className="py-2.5 px-3">Message Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                      {n.patient_id?.slice(0, 8)}...
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                      {n.doctor_id ? `${n.doctor_id.slice(0, 8)}...` : 'ER Attending'}
                    </td>
                    <td className="py-3 px-3 text-slate-800 text-[11px] max-w-lg">
                      {n.message}
                    </td>
                  </tr>
                ))}
                {data.notifications.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                      No notifications dispatched yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dossier Preview Modal */}
      <EmergencyDossierModal
        isOpen={showDossier}
        onClose={() => setShowDossier(false)}
        patient={selectedPatient}
        doctorProfile={{ ...userProfile, role: 'admin', full_name: userProfile?.full_name || 'Hospital Administrator' }}
      />
      </div>
    </div>
  );
}

