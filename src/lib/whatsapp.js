function normalizeWhatsAppNumber(phone) {
  const source = String(phone || '').trim();
  let digits = source.replace(/\D/g, '');
  if (source.startsWith('00')) digits = digits.replace(/^00/, '');

  // MED-ID's local test records use Nigerian 11-digit numbers beginning with 0.
  if (!source.startsWith('+') && digits.length === 11 && digits.startsWith('0')) {
    digits = `234${digits.slice(1)}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

export function buildEmergencyWhatsAppUrl({ phone, patient, senderProfile }) {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return '';

  const patientName = patient?.full_name || 'your family member';
  const nextOfKin = patient?.emerg_name || 'Hello';
  const hospital = senderProfile?.hospital || 'the receiving emergency department';
  const senderName = senderProfile?.role === 'doctor'
    ? senderProfile.full_name || 'the attending physician'
    : 'the MED-ID emergency desk';
  const license = senderProfile?.role === 'doctor' && senderProfile?.license_no
    ? ` (License: ${senderProfile.license_no})`
    : '';

  const message = [
    `MED-ID EMERGENCY ALERT for ${nextOfKin}`,
    `${patientName} has been identified and is receiving emergency care at ${hospital}.`,
    `Contact: ${senderName}${license}.`,
    'Please contact the hospital emergency department as soon as possible.'
  ].join('\n\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
