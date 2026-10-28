import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const MAX_BODY = 16 * 1024 * 1024;
const types: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const limits: Record<string, number> = {
  full_name: 120,
  company: 160,
  email: 200,
  phone: 40,
  service: 40,
  product: 240,
  quantity: 80,
  origin: 120,
  destination: 120,
  timeline: 120,
  message: 6000,
};
export function validateFields(form: FormData) {
  const fields: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = form.get(key);
    if (value !== null && typeof value !== 'string') throw new Error('Invalid field.');
    fields[key] = ((value as string) || '').trim();
    if (fields[key].length > max) throw new Error('A field is too long.');
  }
  if (
    !fields.full_name ||
    !fields.destination ||
    fields.phone.length < 5 ||
    fields.message.length < 20 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
    form.get('consent') !== 'on'
  )
    throw new Error('Please complete all required fields.');
  if (
    ![
      'sourcing',
      'import-export',
      'verification',
      'logistics',
      'consulting',
      'private-label',
      'general',
    ].includes(fields.service)
  )
    throw new Error('Invalid service.');
  return fields;
}
async function validSignature(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = new TextDecoder().decode(b);
  if (file.type === 'application/pdf') return text.startsWith('%PDF-');
  if (file.type === 'image/jpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (file.type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  if (file.type === 'image/webp') return text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP';
  return false;
}
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const headers = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (!allowed.includes(origin)) return reply(403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !key) return reply(503, { error: 'Online requests are not configured.' });
  if (!(req.headers.get('content-type') || '').startsWith('multipart/form-data'))
    return reply(415, { error: 'Expected form data.' });
  let form: FormData;
  try {
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY)
      return reply(413, { error: 'Submission too large.' });
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: 'Empty submission.' });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        return reply(413, { error: 'Submission too large.' });
      }
      chunks.push(value);
    }
    form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { 'content-type': req.headers.get('content-type')! },
    }).formData();
  } catch {
    return reply(400, { error: 'Invalid submission.' });
  }
  if (form.get('website')) return reply(400, { error: 'Invalid submission.' });
  let fields: Record<string, string>;
  try {
    fields = validateFields(form);
  } catch (error) {
    return reply(400, { error: (error as Error).message });
  }
  const submittedId = form.get('submission_id');
  if (
    submittedId !== null &&
    (typeof submittedId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submittedId))
  )
    return reply(400, { error: 'Invalid submission identifier.' });
  const submissionId = submittedId || crypto.randomUUID();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Returning an existing opaque reference never creates a new request or uploads files.
  // Retries need not reuse an already consumed CAPTCHA token.
  if (submittedId) {
    const { data, error } = await db
      .from('website_requests')
      .select('reference')
      .eq('submission_id', submissionId)
      .maybeSingle();
    if (error)
      return reply(503, { error: 'Request storage is unavailable. Please contact our team.' });
    if (data) return reply(200, { reference: data.reference });
  }
  const token = form.get('captcha_token');
  if (typeof token !== 'string' || !token || token.length > 2048)
    return reply(400, { error: 'Security verification required.' });
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    const check = await res.json();
    if (!res.ok || !check.success || check.hostname !== new URL(origin).hostname)
      return reply(400, { error: 'Security verification failed.' });
  } catch {
    return reply(503, { error: 'Security verification unavailable. Please retry.' });
  }
  const entries = form
    .getAll('attachments')
    .filter((value) => value instanceof File && value.size > 0);
  if (entries.length > 3) return reply(400, { error: 'Up to 3 files are permitted.' });
  for (const file of entries as File[]) {
    if (!types[file.type] || file.size > 5 * 1024 * 1024 || !(await validSignature(file)))
      return reply(400, { error: 'Invalid file. Use JPG, PNG, WebP or PDF up to 5 MB.' });
  }
  const id = crypto.randomUUID();
  const uploaded: string[] = [];
  try {
    const attachments = [];
    for (const [i, file] of (entries as File[]).entries()) {
      const path = `${id}/${i}-${crypto.randomUUID()}.${types[file.type]}`;
      const { error } = await db.storage
        .from('request-files')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push(path);
      attachments.push({ name: file.name.slice(0, 200), path, type: file.type, size: file.size });
    }
    const reference =
      'JKM-' +
      new Date().toISOString().slice(0, 10).replaceAll('-', '') +
      '-' +
      id.replaceAll('-', '').slice(0, 12).toUpperCase();
    const { error } = await db
      .from('website_requests')
      .insert({ id, reference, submission_id: submissionId, ...fields, attachments });
    if (error) throw error;
    return reply(201, { reference });
  } catch {
    if (uploaded.length) await db.storage.from('request-files').remove(uploaded);
    // A simultaneous retry may have won the unique submission_id insert.
    if (submittedId) {
      const { data } = await db
        .from('website_requests')
        .select('reference')
        .eq('submission_id', submissionId)
        .maybeSingle();
      if (data) return reply(200, { reference: data.reference });
    }
    return reply(500, {
      error: 'Request could not be saved. Please retry or contact us on WhatsApp.',
    });
  }
});
