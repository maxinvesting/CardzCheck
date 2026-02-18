import Link from "next/link";

export const metadata = {
  title: "Terms of Service - CardzCheck",
  description: "Terms of Service for CardzCheck sports card price lookup",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-blue-400 hover:text-blue-300 mb-8"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold text-white mb-8">Terms of Service</h1>

        <div className="prose prose-invert prose-gray max-w-none space-y-6">
          <p className="text-gray-300">
            <strong>Last Updated:</strong> January 2025
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-300">
              By accessing or using CardzCheck (&quot;the Service&quot;), you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, please do not use the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              2. Description of Service
            </h2>
            <p className="text-gray-300">
              CardzCheck provides sports card price lookup, collection tracking,
              and related tools. Our service includes:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Price comparison data from public marketplaces</li>
              <li>Collection management tools</li>
              <li>Watchlist functionality</li>
              <li>Grade estimation features</li>
              <li>AI-powered card analysis</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              3. Pricing Estimates Disclaimer
            </h2>
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
              <p className="text-yellow-200 font-medium mb-2">
                Important Notice:
              </p>
              <p className="text-gray-300">
                All pricing information displayed on CardzCheck are{" "}
                <strong>estimates only</strong> based on recent sales data from
                public marketplaces. Actual card values may vary significantly
                based on condition, market fluctuations, buyer demand, and other
                factors. CardzCheck does not guarantee the accuracy of any
                pricing data and is not responsible for any financial decisions
                made based on this information.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              4. Grade Estimation Disclaimer
            </h2>
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
              <p className="text-yellow-200 font-medium mb-2">
                Important Notice:
              </p>
              <p className="text-gray-300">
                Grade estimates provided by CardzCheck are{" "}
                <strong>AI-generated predictions</strong> and are{" "}
                <strong>not guaranteed</strong> by PSA, BGS, SGC, or any other
                professional grading company. These estimates are for
                informational purposes only and should not be relied upon as
                official grades. Actual grades assigned by professional grading
                services may differ significantly from our estimates. CardzCheck
                is not affiliated with or endorsed by any grading company.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              5. User Accounts
            </h2>
            <p className="text-gray-300">
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activities under your account. You
              agree to notify us immediately of any unauthorized use.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              6. Subscription and Payments
            </h2>
            <p className="text-gray-300">
              Paid subscriptions are billed according to the plan selected.
              Refunds are handled on a case-by-case basis. You may cancel your
              subscription at any time through your account settings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              7. Prohibited Uses
            </h2>
            <p className="text-gray-300">You agree not to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Use the Service for any illegal purpose</li>
              <li>Scrape or harvest data from the Service</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Resell or redistribute data from the Service</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              8. Limitation of Liability
            </h2>
            <p className="text-gray-300">
              CardzCheck is provided &quot;as is&quot; without warranties of any
              kind. We are not liable for any direct, indirect, incidental, or
              consequential damages arising from your use of the Service,
              including but not limited to financial losses from buying or
              selling cards based on our data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              9. Changes to Terms
            </h2>
            <p className="text-gray-300">
              We reserve the right to modify these terms at any time. Continued
              use of the Service after changes constitutes acceptance of the new
              terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">10. Contact</h2>
            <p className="text-gray-300">
              For questions about these Terms of Service, please contact us
              through our support channels.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link
            href="/privacy"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
