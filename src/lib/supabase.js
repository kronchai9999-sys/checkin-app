import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — สร้างจาก env ของ Vite
 *   VITE_SUPABASE_URL       = https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  = <anon public key>
 *
 * ถ้ายังไม่ได้ตั้ง env → supabase = null และแอปจะทำงานเป็น "โหมดเดโม"
 * (ข้อมูลตัวอย่างในเครื่อง ไม่บันทึกจริง) โดยไม่พัง
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseReady = Boolean(url && anonKey);

export const supabase = isSupabaseReady
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;
