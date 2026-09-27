const SECTIONS = [
  {
    heading: 'What we intentionally don\u2019t collect',
    body: 'No account, no email address, no phone number, and no real name — none of these are ever requested at any point in creating or joining a room.',
  },
  {
    heading: 'What actually happens when you use a room',
    body: 'Creating or joining a room starts a temporary anonymous session held in memory. Messages are encrypted in your browser before they reach the server, which relays ciphertext rather than reading message content. When a room\u2019s timer expires, its state, messages, and any shared files are deleted and every session in it is invalidated.',
  },
  {
    heading: 'What we do not claim',
    body: 'We do not claim messages are "unhackable" or that this is "military-grade" anything. We do not claim to reliably detect or block screenshots or screen recording on every device and browser. We do not claim zero data ever touches our infrastructure.',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <section className="min-h-screen px-4 sm:px-6 pt-28 pb-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#F8FAFC]">Privacy policy</h1>
        <p className="mt-3 text-sm text-[#94A3B8]">Plain language, no fine print doing the opposite of the headline.</p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="text-lg font-medium text-[#F8FAFC]">{section.heading}</h2>
              <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">{section.body}</p>
            </div>
          ))}

          <div id="limitations" className="pt-4 border-t border-white/5">
            <h2 className="text-lg font-medium text-[#F8FAFC]">Limitations</h2>
            <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">
              Infrastructure providers in the delivery path — our hosting provider, reverse proxy,
              CDN, and any error-monitoring tooling — may generate their own operational logs (such
              as connection metadata) as a normal part of running the service. We do not control
              whether those providers log connection-level information, and we minimize what we
              ask them to retain, but we can&apos;t truthfully promise that absolutely nothing about
              a connection is ever processed anywhere in that chain. What we can promise is that
              message content, room passwords, and encryption keys are never written to any log we
              control.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
