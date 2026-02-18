import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - CardzCheck",
  description: "Privacy Policy for CardzCheck sports card price lookup",
};

export default function PrivacyPage() {
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

        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>

        <div className="prose prose-invert prose-gray max-w-none space-y-6">
          <p className="text-gray-300">
            <strong>Last Updated:</strong> January 2025
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
            <p className="text-gray-300">
              CardzCheck (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is
              committed to protecting your privacy. This Privacy Policy explains
              how we collect, use, and safeguard your information when you use
              our sports card price lookup and collection tracking service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              2. Information We Collect
            </h2>
            <h3 className="text-lg font-medium text-gray-200">
              Account Information
            </h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Email address</li>
              <li>Account credentials (securely hashed)</li>
              <li>Subscription and payment status</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-200">Usage Data</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Search queries and history</li>
              <li>Collection data you choose to save</li>
              <li>Watchlist items</li>
              <li>Card images you upload for analysis</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-200">
              Technical Information
            </h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>IP address (for rate limiting and security)</li>
              <li>Browser type and device information</li>
              <li>Usage analytics</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              3. How We Use Your Information
            </h2>
            <p className="text-gray-300">We use collected information to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Provide and maintain the Service</li>
              <li>Process your searches and display relevant pricing data</li>
              <li>Manage your collection and watchlist</li>
              <li>Process payments and manage subscriptions</li>
              <li>Improve our services and user experience</li>
              <li>Prevent abuse and ensure security</li>
              <li>Communicate service updates when necessary</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              4. Data Storage and Security
            </h2>
            <p className="text-gray-300">
              Your data is stored securely using industry-standard practices. We
              use Supabase for database hosting and authentication, and Stripe
              for payment processing. We do not store credit card numbers on our
              servers.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              5. Image Uploads
            </h2>
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
              <p className="text-gray-300">
                When you upload card images for identification or grade
                estimation, these images are processed by our AI systems and may
                be temporarily stored to provide the service. We do not share
                your uploaded images with third parties or use them for training
                AI models.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              6. Third-Party Services
            </h2>
            <p className="text-gray-300">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>
                <strong>Supabase:</strong> Authentication and database hosting
              </li>
              <li>
                <strong>Stripe:</strong> Payment processing
              </li>
              <li>
                <strong>OpenAI:</strong> AI-powered card analysis and grade
                estimation
              </li>
            </ul>
            <p className="text-gray-300">
              Each of these services has their own privacy policies governing
              their use of data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">7. Data Sharing</h2>
            <p className="text-gray-300">
              We do not sell your personal information. We may share data only:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>With service providers necessary to operate the Service</li>
              <li>When required by law or legal process</li>
              <li>To protect our rights or safety</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">8. Your Rights</h2>
            <p className="text-gray-300">You have the right to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Access your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Export your collection data</li>
            </ul>
            <p className="text-gray-300">
              To exercise these rights, contact us through our support channels.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">9. Cookies</h2>
            <p className="text-gray-300">
              We use essential cookies for authentication and session
              management. These are necessary for the Service to function
              properly.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              10. Children&apos;s Privacy
            </h2>
            <p className="text-gray-300">
              The Service is not intended for children under 13. We do not
              knowingly collect information from children under 13.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">
              11. Changes to This Policy
            </h2>
            <p className="text-gray-300">
              We may update this Privacy Policy from time to time. We will
              notify you of significant changes by posting the new policy on
              this page and updating the &quot;Last Updated&quot; date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">12. Contact Us</h2>
            <p className="text-gray-300">
              For questions about this Privacy Policy or our data practices,
              please contact us through our support channels.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link
            href="/terms"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
