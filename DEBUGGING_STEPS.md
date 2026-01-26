# Debug Steps for Auth Issue

## Quick Test - Follow These Steps

1. **Open your browser DevTools (F12)** and go to the Console tab

2. **Clear all cookies:**
   - In DevTools, go to Application tab → Storage → Cookies → http://localhost:3000
   - Click "Clear All"

3. **Try logging in** and watch the console for these messages:
   - "Login response: {hasSession: true/false, hasUser: true/false}"
   - "Redirecting to: /collection" (or whatever page)
   - "Middleware check: {path, hasSession, hasUser, cookies}"

4. **What to look for:**
   - If login shows `hasSession: true` but middleware shows `hasSession: false`, cookies aren't being saved
   - If you see NO Supabase cookies (like `sb-*-auth-token`), that's the problem
   - If middleware doesn't log anything, the redirect happens too fast

## Next: Check Supabase Settings

Go to your Supabase dashboard:
https://supabase.com/dashboard/project/bnhcngudpfswzuyuyesn

1. **Authentication → Settings**
   - Check if "Enable email confirmations" is ON
   - If ON, you need to confirm email before login works
   - For dev, turn it OFF

2. **Authentication → URL Configuration**
   - Site URL should be: `http://localhost:3000`
   - Redirect URLs should include: `http://localhost:3000/**`

## If Still Broken: Check Cookie Settings

The issue might be browser security blocking cookies. Check:

1. **Incognito/Private Mode** - Try logging in there
2. **Different Browser** - Test in Chrome vs Firefox vs Safari
3. **Cookie Settings** - Make sure third-party cookies aren't blocked

## Report Back

Tell me what you see in the console logs and I can pinpoint the exact issue!
