# Glowth Waitlist Page - Deployment Guide

## 🎯 Complete Setup Instructions

This guide will help you deploy your Glowth waitlist page in **15-20 minutes**.

---

## 📋 What You'll Need

Before starting, make sure you have:
- ✅ Vercel account (free) - vercel.com
- ✅ Supabase account (free) - supabase.com  
- ✅ n8n account/instance on Render
- ✅ glowth.in domain (already purchased from Hostinger)
- ✅ Cloudflare account (already setup)

---

## 🚀 Step 3: Deploy on Vercel (FREE)

### Option A: Vercel CLI (Recommended)

**1. Install Vercel CLI:**
```bash
npm i -g vercel
```

**2. Navigate to project folder:**
```bash
cd path/to/glowth-waitlist
```

**3. Deploy:**
```bash
vercel
```

**4. Follow prompts:**
- "Set up and deploy"? → **Y**
- "Which scope"? → **Select your account**
- "Link to existing project"? → **N**
- "Project name"? → **glowth-waitlist**
- "In which directory"? → **./** (press enter)
- "Want to modify settings"? → **N**

**5. Done!** You'll get a URL like: `glowth-waitlist.vercel.app`

---

### Option B: Vercel Dashboard (Drag & Drop)

**1. Go to:** vercel.com/new

**2. Upload files:**
- Drag the `glowth-waitlist` folder
- Or connect GitHub repo (if you pushed to GitHub)

**3. Click "Deploy"**

**4. Wait 30 seconds** - Done! ✅

---

## 🔗 Step 4 & 5: Connect glowth.in Domain

### In Vercel Dashboard:

**1. Go to your project** → Settings → Domains

**2. Click "Add Domain"**

**3. Enter:** `glowth.in`

**4. Click "Add"**

**5. Vercel will show DNS records**

---

### In Cloudflare (Update existing CNAME):

**You already have CNAME setup, just UPDATE the target:**

**Current (from Framer attempt):**
```
Type: CNAME
Name: @
Target: glowth.framer.website  ← OLD
Proxy: ON
```

**Change to (for Vercel):**
```
Type: CNAME
Name: @
Target: cname.vercel-dns.com  ← NEW
Proxy: OFF (turn orange cloud to grey)
```

**Also update WWW:**
```
Type: CNAME
Name: www
Target: cname.vercel-dns.com  ← NEW
Proxy: OFF
```

**IMPORTANT:** Proxy must be OFF (grey cloud) for Vercel!

**6. Save changes**

**7. Back to Vercel, click "Verify"**

**8. Wait 5-30 minutes** for DNS propagation

**9. Test:** `https://glowth.in` ✅

---

## 💾 Supabase Database Setup

### 1. Create Supabase Project

**Go to:** supabase.com/dashboard

**Click:** "New Project"

**Fill in:**
- Name: Glowth
- Database Password: (create strong password - SAVE THIS!)
- Region: Select closest to you
- Pricing Plan: Free

**Click:** "Create new project"

**Wait 2-3 minutes** for project setup

---

### 2. Create Waitlist Table

**Go to:** SQL Editor (left sidebar)

**Copy and paste this SQL:**

```sql
-- Create waitlist table
CREATE TABLE waitlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'website',
    status VARCHAR(50) DEFAULT 'pending',
    notified BOOLEAN DEFAULT FALSE,
    metadata JSONB
);

-- Create index for faster email lookups
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at DESC);

-- Add Row Level Security (RLS)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Policy to allow inserts (for n8n)
CREATE POLICY "Allow insert for service role"
    ON waitlist FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Policy to allow select for service role
CREATE POLICY "Allow select for service role"
    ON waitlist FOR SELECT
    TO service_role
    USING (true);
```

**Click:** "Run" button

**You should see:** "Success. No rows returned"

---

### 3. Get API Keys

**Go to:** Project Settings (gear icon) → API

**Copy these (you'll need them):**
- **Project URL:** `https://xxxxx.supabase.co`
- **anon public key:** `eyJhbG...` (long string)
- **service_role key:** `eyJhbG...` (different long string)

**⚠️ IMPORTANT:** Keep service_role key SECRET - never expose in frontend!

---

### 4. Test Your Table

**Go to:** Table Editor → waitlist

**You should see** empty table with columns:
- id
- email
- created_at
- source
- status
- notified
- metadata

✅ Table created successfully!

---

## 🔧 n8n Workflow Setup

### 1. Create New Workflow

**In n8n dashboard:**

**Click:** "New Workflow"

**Name it:** "Glowth Waitlist Handler"

---

### 2. Add Nodes

**Node 1: Webhook (Trigger)**

**Click:** "+ Add node" → Webhook

**Settings:**
- HTTP Method: POST
- Path: waitlist
- Response Mode: "Respond Immediately"
- Response Code: 200
- Response Data: Custom

**Response Body:**
```json
{
  "success": true,
  "message": "You're on the waitlist!"
}
```

**Save and activate**

**Copy Webhook URL** (e.g., `https://your-n8n.onrender.com/webhook/waitlist`)

---

**Node 2: Supabase Insert**

**Click:** "+ Add node" → Supabase

**Settings:**
- Resource: Row
- Operation: Insert
- Table: waitlist

**Credentials:**
- Host: Your Supabase Project URL
- Service Role Secret: Your service_role key

**Columns:**
- email: `{{ $json.email }}`
- source: `{{ $json.source }}`
- created_at: `{{ $json.timestamp }}`

**Options:**
- On Conflict: Do Nothing (prevents duplicates)

---

**Node 3: Send Email (Optional)**

**Click:** "+ Add node" → Gmail (or SendGrid, SMTP)

**Settings:**
- To: `{{ $json.email }}`
- Subject: "Welcome to Glowth Waitlist! 🌟"
- Body:

```
Hi there!

Thanks for joining the Glowth waitlist! You're among the first to know when we launch.

What happens next?
✨ Early access to the platform
💰 Exclusive launch discount  
🎁 Weekly skincare tips

We'll keep you posted!

Best,
Team Glowth
```

---

**Node 4: Slack Notification (Optional)**

**For your own tracking:**

**Add:** Slack node

**Message:**
```
🎉 New waitlist signup!
Email: {{ $json.email }}
Source: {{ $json.source }}
Time: {{ $json.timestamp }}
```

---

### 3. Connect Nodes

**Connect in this order:**
1. Webhook → Supabase Insert
2. Supabase Insert → Send Email
3. Send Email → Slack (optional)

**Save workflow**

**Activate workflow** (toggle switch on top right)

---

### 4. Update HTML File

**Open:** `index.html`

**Find line ~240:**
```javascript
const webhookURL = 'YOUR_N8N_WEBHOOK_URL_HERE';
```

**Replace with your actual webhook URL:**
```javascript
const webhookURL = 'https://your-n8n.onrender.com/webhook/waitlist';
```

**Save file**

**Re-deploy to Vercel:**
```bash
vercel --prod
```

---

## ✅ Testing Checklist

### Test 1: Form Submission

**1. Go to:** `https://glowth.in`

**2. Enter test email:** `test@example.com`

**3. Click:** "Join the waitlist"

**4. Should see:** Success message ✅

---

### Test 2: Check Supabase

**1. Go to:** Supabase → Table Editor → waitlist

**2. Should see:** New row with your test email ✅

---

### Test 3: Check Email

**1. Check inbox** of test email

**2. Should receive:** Welcome email ✅

---

### Test 4: Test Duplicate

**1. Try submitting** same email again

**2. Should:** Still succeed (n8n handles duplicate with "Do Nothing")

**3. Supabase:** Should NOT create duplicate row ✅

---

### Test 5: Mobile Responsive

**1. Open on phone:** `https://glowth.in`

**2. Check:** Layout looks good ✅

**3. Test:** Form submission works ✅

---

## 📊 View Waitlist Dashboard

### In Supabase:

**Method 1: Table Editor**
- Supabase Dashboard → Table Editor → waitlist
- See all signups in table view
- Click email to see details

**Method 2: SQL Editor**
```sql
-- Count total signups
SELECT COUNT(*) as total_signups FROM waitlist;

-- Recent signups (last 10)
SELECT email, created_at 
FROM waitlist 
ORDER BY created_at DESC 
LIMIT 10;

-- Signups by source
SELECT source, COUNT(*) as count 
FROM waitlist 
GROUP BY source;
```

**Method 3: Export CSV**
- Table Editor → waitlist
- Click "..." menu → Export to CSV

---

## 🔔 Send Updates to Waitlist

### When you're ready to launch:

**SQL Query to get all emails:**
```sql
SELECT email 
FROM waitlist 
WHERE status = 'pending' 
  AND notified = FALSE
ORDER BY created_at ASC;
```

**Copy emails** and send via:
- Mailchimp
- SendGrid
- ConvertKit
- Or your email service

**After sending, mark as notified:**
```sql
UPDATE waitlist 
SET notified = TRUE, 
    status = 'invited'
WHERE status = 'pending';
```

---

## 🛠️ Troubleshooting

### Issue: Domain not working

**Solution:**
```
1. Check Cloudflare DNS:
   - CNAME @ → cname.vercel-dns.com
   - Proxy OFF (grey cloud)

2. Check Vercel:
   - Domain added and verified
   - SSL certificate issued

3. Wait 15-30 minutes for DNS propagation

4. Clear browser cache (Ctrl+Shift+Delete)

5. Try incognito/private mode
```

---

### Issue: Form submission error

**Solution:**
```
1. Check browser console (F12) for errors

2. Verify webhook URL in index.html is correct

3. Test webhook directly:
   curl -X POST https://your-webhook-url \
   -H "Content-Type: application/json" \
   -d '{"email":"test@test.com","source":"test"}'

4. Check n8n workflow is activated

5. Check n8n execution logs for errors
```

---

### Issue: Email not sending

**Solution:**
```
1. Check n8n email node credentials

2. Test email node separately in n8n

3. Check spam folder

4. Verify email service (Gmail) is connected

5. Check email service quota/limits
```

---

### Issue: Duplicate emails in Supabase

**Solution:**
```
This shouldn't happen with our setup, but if it does:

1. Check n8n Supabase node settings:
   - "On Conflict" should be "Do Nothing"

2. Verify email column has UNIQUE constraint:
   ALTER TABLE waitlist 
   ADD CONSTRAINT unique_email UNIQUE (email);

3. Remove duplicates:
   DELETE FROM waitlist a
   USING waitlist b
   WHERE a.id > b.id 
   AND a.email = b.email;
```

---

## 📱 Next Steps After Launch

### Week 1:
- ✅ Monitor signups daily
- ✅ Send welcome email to first 100
- ✅ Share on social media
- ✅ Add Google Analytics (optional)

### Week 2-4:
- ✅ Build n8n workflows for product
- ✅ Complete Gemini AI integration
- ✅ Test beta features
- ✅ Prepare launch announcement

### Month 2:
- ✅ Notify waitlist of launch
- ✅ Give early access
- ✅ Collect feedback
- ✅ Iterate and improve

---

## 🎉 You're Live!

**Congratulations!** 🚀

Your waitlist page is now live at: **https://glowth.in**

**Share it:**
- Twitter/X
- LinkedIn
- Instagram
- WhatsApp groups
- Reddit (r/SkincareAddiction)
- Facebook groups

**Track growth:**
- Check Supabase daily
- Celebrate milestones (50, 100, 500 signups)
- Engage with early supporters

---

## 📧 Support

**Need help?**

If you run into any issues:
1. Check this README first
2. Review error messages carefully
3. Test each component separately
4. Check service dashboards (Vercel, Supabase, n8n)

**Common resources:**
- Vercel Docs: vercel.com/docs
- Supabase Docs: supabase.com/docs
- n8n Docs: docs.n8n.io
- Cloudflare Docs: developers.cloudflare.com

---

## ✅ Final Checklist

Before announcing your launch:

```
☐ glowth.in loads correctly
☐ Form submission works
☐ Success message shows
☐ Email appears in Supabase
☐ Welcome email sent (if configured)
☐ Mobile responsive works
☐ HTTPS working (green padlock)
☐ All links work (navigation, footer)
☐ Social icons link correctly
☐ Tested on multiple devices
☐ Tested on multiple browsers
☐ Analytics setup (optional)
☐ Ready to share! 🎉
```

---

**Good luck with your launch!** 🚀✨

The first 1000 users are always the hardest - but also the most valuable. They believe in you before the product even exists!

---

*Made with ❤️ for Glowth*
