export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-4 text-gray-300">
          Welcome to CardzCheck. By using the service, you agree to these terms. If you do not agree, please do not
          use the app.
        </p>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Service Overview</h2>
          <p>
            CardzCheck provides sports card price comps, collection tracking, and AI-assisted tools. We aim to deliver
            helpful insights, but we do not guarantee accuracy, completeness, or availability at all times.
          </p>
          <p>
            Pricing estimates and grading estimates are informational only. They are based on available market data
            and automated analysis, which can be incomplete or incorrect. Do not rely on them as professional
            appraisals or guarantees.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">User Responsibilities</h2>
          <p>
            You are responsible for the content you upload and the accuracy of any information you provide. You must
            comply with applicable laws and not upload content that infringes on the rights of others.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Payments &amp; Subscriptions</h2>
          <p>
            Paid features are billed through our payment processor. All prices are subject to change. If you subscribe,
            you authorize us to charge your payment method according to the plan you select.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Disclaimer of Warranties</h2>
          <p>
            The service is provided “as is” without warranties of any kind. We disclaim all implied warranties,
            including merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-gray-300">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>If you have questions about these terms, please contact support.</p>
        </section>
      </div>
    </main>
  );
}
