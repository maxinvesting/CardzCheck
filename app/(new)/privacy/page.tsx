export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-4 text-gray-300">
          CardzCheck respects your privacy. This policy explains what we collect and how we use it.
        </p>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Account information such as email address and profile details.</li>
            <li>Usage data to understand feature adoption and improve the product.</li>
            <li>Uploaded images used for card identification and collection tracking.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Provide price comps, collection tracking, and AI-assisted features.</li>
            <li>Maintain security, prevent abuse, and enforce usage limits.</li>
            <li>Improve accuracy of pricing estimates and grading estimates over time.</li>
          </ul>
          <p>
            Pricing estimates and grading estimates are informational only and may be inaccurate. They do not constitute
            professional appraisals or guarantees.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Sharing</h2>
          <p>
            We do not sell your personal information. We may share data with trusted service providers (like payment or
            infrastructure vendors) solely to operate the service.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Data Retention</h2>
          <p>
            We retain your information as long as your account is active or as needed to provide the service. You may
            request deletion of your account data, subject to legal requirements.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>If you have questions about this policy, please contact support.</p>
        </section>
      </div>
    </main>
  );
}
