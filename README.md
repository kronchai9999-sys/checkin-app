# แอปเช็คอินพนักงาน (เบเกอร์บรรจุภัณฑ์)

แอปลงเวลาทำงานสำหรับพนักงาน — เข้าสู่ระบบด้วย PIN, เช็คอิน/เช็คเอาด้วย GPS,
ตรวจตารางเวลา และดูสลิปเงินเดือน

## เทคโนโลยี
- React 18 + Vite
- Tailwind CSS

## รันในเครื่อง
```bash
npm install
npm run dev
```
เปิด http://localhost:5173

- **PIN ทดสอบ:** `123456` (แก้ได้ที่ `src/PinLogin.jsx` → `DEMO_PIN`)

## หน้าจอ
| หน้า | ไฟล์ | รายละเอียด |
|------|------|-----------|
| เข้าสู่ระบบ | `src/PinLogin.jsx` | คีย์แพด PIN 6 หลัก |
| เช็คอิน | `src/CheckIn.jsx` | ปุ่มเดียวเช็คอิน↔เช็คเอา, GPS อย่างเดียว, เวลาเรียลไทม์ |
| ตารางเวลา | `src/Timesheet.jsx` | ตรวจ/แก้เวลา + คำนวณ OT (ปัดเศษ ≥45 น. ขึ้น 1 ชม.) |
| สลิป | `src/Payslip.jsx` | สลิปเงินเดือน |

## Deploy ขึ้น Vercel
1. push โค้ดขึ้น GitHub
2. ที่ Vercel เลือก **Import Project** → เลือก repo นี้
3. Framework = **Vite** (ตรวจอัตโนมัติ), Build = `npm run build`, Output = `dist`
4. กด Deploy

## ต่อ Supabase (บันทึกข้อมูลจริง)
แอปทำงานได้ 2 โหมดอัตโนมัติ:
- **ไม่ตั้ง env** → โหมดเดโม (ข้อมูลตัวอย่าง, PIN `123456`, ไม่บันทึกจริง)
- **ตั้ง env แล้ว** → ล็อกอินด้วย PIN จริง + เช็คอิน/เอาต์บันทึกลง `attendance_logs`

**ขั้นตอนเปิดใช้:**
1. Supabase → เปิดโปรเจกต์ `checkin-app` (ถ้า paused กด **Restore**)
2. **SQL Editor → New query** → วางไฟล์ [`supabase/schema.sql`](supabase/schema.sql) → **Run**
   (สร้างตาราง companies/branches/shifts/employees/attendance_logs + RPC `login_by_pin` + seed ตัวอย่าง)
3. **Project Settings → API** คัดลอก `Project URL` และ `anon public key`
4. **Vercel → checkin-app → Settings → Environment Variables** เพิ่ม 2 ตัว (ทุก Environment):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deployments → Redeploy** (env ใหม่มีผลตอน build เท่านั้น)
6. แก้ PIN/เงินเดือนพนักงานจริงในตาราง `employees` (seed ให้ PIN `123456` = สมหญิง, `141414` = ประยุทธ์)

**สถานะการต่อ DB ต่อหน้า:**
| หน้า | ต่อ DB แล้ว? |
|------|------|
| เข้าสู่ระบบ (PIN) | ✅ RPC `login_by_pin` |
| เช็คอิน | ✅ บันทึก/อ่าน `attendance_logs`, สาขา/กะจากพนักงาน |
| ตารางเวลา (Timesheet) | ⏳ เฟส 2 (ต้องมี role แอดมิน + เก็บพักเที่ยง 4 ช่อง) |
| สลิป (Payslip) | ⏳ เฟส 2 (ต้องมีตารางเงินกู้/รายการหัก) |

> ความปลอดภัย: PIN เก็บในตาราง `employees` แต่ปิดอ่านผ่าน RLS (anon อ่านตรงไม่ได้) —
> ล็อกอินผ่าน RPC `login_by_pin` เท่านั้น ก่อน production ควรทำ hash PIN + auth เต็มรูปแบบ
