import React from 'react';
import { ArrowRight, MessageCircle, Scan, Stethoscope, UserCheck } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: UserCheck,
    title: 'Create an emergency profile',
    description: 'Add essential medical details and next-of-kin contacts. Enroll a face profile and an optional device authenticator.',
    accent: 'bg-rose-50 text-rose-600 ring-rose-100'
  },
  {
    number: '02',
    icon: Scan,
    title: 'Identify and review',
    description: 'Authorized clinicians scan a patient or search by name, then review the structured emergency record.',
    accent: 'bg-rose-50 text-rose-600 ring-rose-100'
  },
  {
    number: '03',
    icon: MessageCircle,
    title: 'Contact the family',
    description: 'Open a pre-filled WhatsApp alert for the next of kin. The sender reviews the message and confirms Send in WhatsApp.',
    accent: 'bg-rose-50 text-rose-600 ring-rose-100'
  }
];

export default function LandingPage({ onOpenAuth }) {
  return (
    <div className="space-y-16 py-10 sm:space-y-20 sm:py-14">
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            When patients can't speak,<br />
            <span className="bg-gradient-to-r from-emergency-600 via-rose-500 to-brand-600 bg-clip-text text-transparent">their medical history should.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base font-normal leading-relaxed text-slate-600 sm:text-lg">
            MED-ID helps authorized emergency teams identify patients, review essential medical information, and reach their listed next of kin.
          </p>
          <div className="flex flex-col items-center justify-center gap-3.5 pt-2 sm:flex-row">
            <button onClick={() => onOpenAuth('patient', 'signup')} className="group corporate-btn-brand w-full !px-6 !py-3.5 !text-base shadow-sm sm:w-auto">
              <UserCheck className="h-5 w-5 text-brand-200 transition-transform group-hover:scale-105" />
              <span>Register as a patient</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => onOpenAuth('doctor', 'signin')} className="group corporate-btn-emergency w-full !px-6 !py-3.5 !text-base sm:w-auto">
              <Stethoscope className="h-5 w-5 text-rose-100 transition-transform group-hover:scale-105" />
              <span>Doctor sign in</span>
            </button>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 pt-6 text-left md:grid-cols-4">
            {[
              ['Face identification', 'Enrollment and scan'],
              ['Structured record', 'One scrollable history'],
              ['Family contact', 'WhatsApp message draft'],
              ['Access history', 'Auditable activity']
            ].map(([title, caption]) => <div key={title} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-900">{title}</p>
              <p className="mt-1 text-[10px] text-slate-500">{caption}</p>
            </div>)}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50/80 py-14 sm:py-16" aria-labelledby="how-it-works-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <span className="inline-flex rounded-full border border-rose-100 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">How it works</span>
            <h2 id="how-it-works-title" className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Three steps to an emergency-ready profile</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">A simple workflow for patient enrollment, clinical review, and family contact.</p>
          </div>

          <div className="relative grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-8">
            <div aria-hidden="true" className="absolute left-[17%] right-[17%] top-9 hidden border-t border-dashed border-rose-200 md:block" />
            {steps.map(({ number, icon: Icon, title, description, accent }) => <article key={number} className="relative rounded-2xl border border-slate-200 bg-white px-6 pb-6 pt-5 shadow-sm">
              <div className="relative z-10 mb-5 flex items-center gap-3">
                <div className={`flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl ring-1 ${accent}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold tracking-[0.12em] text-rose-600">STEP {number}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p>
            </article>)}
          </div>

        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-brand-50/60 p-7 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div className="max-w-2xl">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">Get started</span>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Make essential information easier to reach.</h3>
            <p className="mt-2 text-xs text-slate-600">Create a patient profile or sign in to the clinician workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => onOpenAuth('patient', 'signup')} className="corporate-btn-brand !px-5 !py-3 !text-sm">Patient registration</button>
            <button onClick={() => onOpenAuth('doctor', 'signin')} className="corporate-btn-secondary !px-5 !py-3 !text-sm"><Stethoscope className="h-4 w-4 text-rose-600" />Doctor sign in</button>
          </div>
        </div>
      </section>
    </div>
  );
}
