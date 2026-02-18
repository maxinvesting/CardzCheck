from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUTPUT_PATH = "output/pdf/cardzcheck-app-summary.pdf"

PAGE_W, PAGE_H = letter
MARGIN_X = 46
TOP_Y = PAGE_H - 46
LINE = 12

TITLE_SIZE = 17
H_SIZE = 11
BODY_SIZE = 9


def draw_heading(c, text, y):
    c.setFont("Helvetica-Bold", H_SIZE)
    c.drawString(MARGIN_X, y, text)
    return y - LINE


def draw_paragraph(c, text, y, indent=0, max_chars=104):
    c.setFont("Helvetica", BODY_SIZE)
    words = text.split()
    line = ""
    x = MARGIN_X + indent
    for w in words:
        test = (line + " " + w).strip()
        if len(test) > max_chars:
            c.drawString(x, y, line)
            y -= LINE
            line = w
        else:
            line = test
    if line:
        c.drawString(x, y, line)
        y -= LINE
    return y


def draw_bullet(c, text, y):
    c.setFont("Helvetica", BODY_SIZE)
    c.drawString(MARGIN_X, y, "-")
    return draw_paragraph(c, text, y, indent=12, max_chars=99)


def build_pdf(path):
    c = canvas.Canvas(path, pagesize=letter)
    y = TOP_Y

    c.setFont("Helvetica-Bold", TITLE_SIZE)
    c.drawString(MARGIN_X, y, "CardzCheck App Summary (Repo-Based)")
    y -= 18
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN_X, y, "Evidence sources: app/, components/, lib/, supabase/migrations/, QUICK_START.md, .env.example")
    y -= 16

    y = draw_heading(c, "What It Is", y)
    y = draw_paragraph(
        c,
        "CardzCheck is a Next.js sports card platform that combines comps search, estimated CMV, collection tracking, and AI-assisted workflows in one app. "
        "It integrates pricing, card identification, grading analysis, and subscription controls through a single authenticated experience.",
        y,
    )

    y -= 2
    y = draw_heading(c, "Who It Is For", y)
    y = draw_paragraph(
        c,
        "Primary persona: sports card collectors and hobby investors/resellers who need faster pricing checks, collection visibility, and decision support.",
        y,
    )
    y = draw_paragraph(c, "Detailed formal persona document: Not found in repo.", y)

    y -= 2
    y = draw_heading(c, "What It Does", y)
    features = [
        "Runs card comps search with an eBay dual-signal engine and returns CMV-oriented stats (for-sale + estimated sale range).",
        "Identifies card details from uploaded images (URL or base64) with image validation and Anthropic-powered OCR/vision extraction.",
        "Lets users add, view, filter, sort, export/import, and maintain collection items with CMV state and card image support.",
        "Provides a Pro watchlist with target-price tracking and periodic price refresh endpoints.",
        "Runs grade-estimate jobs from card photos, then computes post-grading value and worth-grading outcomes.",
        "Offers a Pro analyst chat plus persisted analyst threads/messages with usage controls.",
        "Supports search assist via player/set typeahead and card-catalog lookup endpoints.",
    ]
    for item in features:
        y = draw_bullet(c, item, y)

    y -= 2
    y = draw_heading(c, "How It Works (Architecture)", y)
    arch = [
        "Frontend: Next.js App Router pages (for example /dashboard, /comps, /collection, /watchlist, /grade-estimator) with React client components and AuthContext.",
        "Backend-for-frontend: Route handlers in app/api/* validate input, enforce auth/plan limits, and orchestrate feature logic.",
        "Core services in lib/: ebay/* pricing pipeline, card-identity/* extraction, grading/* job flow, stripe.ts billing helpers, and utilities for CMV/search/state.",
        "Data layer: Supabase auth + Postgres tables (users, collection_items, card_images, watchlist, recent_searches, analyst_threads, grade_estimator_runs, subscriptions, usage) inferred from routes/types/migrations.",
        "Request flow: Browser UI -> /api routes -> lib services -> external providers (Supabase, eBay, Anthropic, Stripe) -> JSON -> UI state updates.",
    ]
    for item in arch:
        y = draw_bullet(c, item, y)

    y -= 2
    y = draw_heading(c, "How To Run (Minimal)", y)
    run_steps = [
        "Copy env template and set keys: cp .env.example .env, then fill Supabase, Anthropic, and Stripe variables listed in .env.example.",
        "Create Supabase Storage bucket card-images (public) and apply bucket policies documented in SUPABASE_STORAGE_SETUP.md.",
        "Start app: npm run dev, then open http://localhost:3000.",
        "Local DB migration/seed command for full local stack: Not found in repo.",
    ]
    for step in run_steps:
        y = draw_bullet(c, step, y)

    c.showPage()
    c.save()


if __name__ == "__main__":
    build_pdf(OUTPUT_PATH)
    print(OUTPUT_PATH)
