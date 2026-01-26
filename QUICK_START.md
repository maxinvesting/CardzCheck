# Quick Start Guide - New Features

## 🚀 Getting Started in 3 Steps

### Step 1: Set Up Supabase Storage (One-Time Setup)
**Time Required: 2 minutes**

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to **Storage** → Click **New Bucket**
3. Create bucket:
   - Name: `card-images`
   - Set to **Public**: ✅
   - Click **Create**

📖 Detailed instructions: See `SUPABASE_STORAGE_SETUP.md`

---

### Step 2: Start the Dev Server

bash
npm run dev


Open [http://localhost:3000](http://localhost:3000)

---

### Step 3: Test the New Features

#### Option A: Upload a Card Photo
1. Go to `/search` page
2. Drag & drop a card image or click to upload
3. The system will identify the card and fill the form
4. Click "Search eBay Sold" to find prices

#### Option B: Use Smart Search (No Photo Required)
1. Go to `/search` page
2. Click on "Player Name" field
3. Start typing a name (e.g., "Michael")
4. Select from autocomplete suggestions
5. Do the same for Set/Brand and Grade
6. Click "Search eBay Sold"

---

## 🎯 Feature Highlights

### Autocomplete in Action

**Player Name Field:**
- Type: `mich` → See: "Michael Jordan (Basketball)"
- Type: `lebr` → See: "LeBron James (Basketball)"
- Type: `trout` → See: "Mike Trout (Baseball)"

**Set/Brand Field:**
- Type: `prizm` → See: "Panini Prizm (2012-Present)"
- Type: `topps` → See multiple Topps sets
- Type: `fleer` → See: "Fleer (1986-2007)"

**Grade Field:**
- Click to see all options
- Select "PSA 10 - Gem Mint"
- Or "BGS 9.5 - Gem Mint"
- Or "Raw/Ungraded"

### Keyboard Shortcuts
- `↓` - Move down in suggestions
- `↑` - Move up in suggestions
- `Enter` - Select highlighted suggestion
- `Esc` - Close suggestions
- `Tab` - Move to next field

---

## 💡 Pro Tips

### Better Image Processing
✅ **Do:**
- Use good lighting
- Center the card in frame
- Keep the card flat
- Upload high-resolution images

❌ **Don't:**
- Upload blurry photos
- Use images with glare
- Crop too tight
- Upload very small images

### Better Search Results
- Be specific with player names
- Include card year when known
- Select exact set name from autocomplete
- Specify grade for graded cards only

---

## 🐛 Troubleshooting

### "Bucket not found" error when uploading?
→ You need to create the Supabase bucket (Step 1 above)

### No autocomplete suggestions appearing?
→ Type at least 2 characters to trigger suggestions

### Can't find a player in autocomplete?
→ Just keep typing! Custom names are still allowed

### Image upload stuck on "Processing card..."?
→ Check your Anthropic API key in `.env`

---

## 📊 What Changed?

### Before:
- Plain text inputs
- No suggestions
- Easy to misspell names
- Had to know exact set names
- Had to type full grade descriptions

### After:
- ✨ Smart autocomplete everywhere
- 🎯 50+ players in database
- 📦 30+ card sets with years
- 🏆 Complete grading scales
- ⚡ Faster data entry
- ✅ Fewer search errors

---

## 🎨 UI Improvements

- Clear button (X) to reset fields
- Helpful error messages with icons
- Dark mode support
- Better mobile experience
- Keyboard accessible

---

## 📝 Example Searches to Try

### Example 1: Michael Jordan Rookie
- Player: "Michael Jordan"
- Year: "1986"
- Set: "Fleer"
- Grade: "PSA 10"

### Example 2: Modern Basketball
- Player: "Luka Doncic"
- Year: "2018"
- Set: "Panini Prizm"
- Grade: "PSA 9"

### Example 3: Baseball Star
- Player: "Shohei Ohtani"
- Year: "2018"
- Set: "Topps Chrome"
- Grade: "BGS 9.5"

---

## 🔗 Helpful Links

- [Full Improvements Summary](./IMPROVEMENTS_SUMMARY.md)
- [Supabase Setup Guide](./SUPABASE_STORAGE_SETUP.md)
- [Debugging Steps](./DEBUGGING_STEPS.md)

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Supabase bucket created
- [ ] Dev server running
- [ ] Can access `/search` page
- [ ] Player autocomplete shows suggestions
- [ ] Set autocomplete shows suggestions
- [ ] Grade autocomplete shows all options
- [ ] Can upload card image (after bucket setup)
- [ ] Search returns eBay results
- [ ] Can add cards to collection

---

## 🆘 Need Help?

Check these files in order:
1. This guide (`QUICK_START.md`)
2. Setup guide (`SUPABASE_STORAGE_SETUP.md`)
3. Full summary (`IMPROVEMENTS_SUMMARY.md`)
4. Debugging guide (`DEBUGGING_STEPS.md`)

Still stuck? Check:
- Browser console for errors
- `.env` file for missing keys
- Supabase dashboard for bucket status

---

**Happy Searching! 🎉**
