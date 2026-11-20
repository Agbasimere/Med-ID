import React, { useState, useEffect } from 'react';
import { Database, Key, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import { getStoredConfig, saveStoredConfig, clearStoredConfig, supabase } from '../lib/supabase';

export default function SupabaseConfigModal({ isOpen, onClose, onConfigSaved }) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const config = getStoredConfig();
      setUrl(config.url || '');
      setAnonKey(config.anonKey || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!url || !anonKey) {
      setTestResult({ success: false, message: 'Please enter both the Supabase URL and Anon Key.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      saveStoredConfig(url, anonKey);
      const client = supabase.client;
      if (!client) throw new Error('Client could not be initialized.');

      // Test query to profiles
      const { data, error } = await client.from('profiles').select('count', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') {
        // Table might not exist yet, but connection is alive!
        if (error.message && error.message.includes('relation "public.profiles" does not exist')) {
          setTestResult({
            success: true,
            warning: true,
            message: 'Connected to Supabase! However, the database tables have not been created yet. Please run the SQL schema script below in your Supabase SQL Editor.'
          });
        } else {
          setTestResult({
            success: false,
            message: `Connection error: ${error.message}`
          });
        }
      } else {
        setTestResult({
          success: true,
          message: 'Connection successful! Supabase tables and policies are online.'
        });
      }

      if (onConfigSaved) onConfigSaved();
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to connect to Supabase.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveStoredConfig(url, anonKey);
    if (onConfigSaved) onConfigSaved();
    onClose();
  };

  const handleCopySql = async () => {
    try {
      const res = await fetch('/supabase_schema.sql');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch (e) {
      // Fallback
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="corporate-card max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 border border-brand-200">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Supabase Backend Setup</h2>
            <p className="text-xs text-slate-500">Live Hackathon Database Connection</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Project URL
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="corporate-input font-mono text-xs pr-10"
              />
              <ExternalLink className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Found in: Supabase Dashboard &gt; Project Settings &gt; API
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Anon Public API Key
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                className="corporate-input font-mono text-xs pr-10"
              />
              <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Found in: Supabase Dashboard &gt; Project Settings &gt; API &gt; Project API keys (`anon` / `public`)
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? testResult.warning
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
              )}
              <div>
                <p className="font-semibold">{testResult.success ? 'Backend Status' : 'Connection Failed'}</p>
                <p className="mt-0.5 text-slate-700">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* SQL Schema helper */}
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-800">Database Schema (One-Click Setup)</span>
              </div>
              <button
                onClick={handleCopySql}
                className="corporate-btn-secondary !py-1 !px-2.5 !text-xs gap-1.5"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL Schema</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Copy the schema script and paste it directly into your Supabase <strong>SQL Editor</strong> to create the <code>patients</code>, <code>doctors</code>, <code>scan_audit_logs</code>, and security policies in 5 seconds.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !url || !anonKey}
              className="corporate-btn-secondary !text-xs disabled:opacity-50"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="corporate-btn-brand !text-xs"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
