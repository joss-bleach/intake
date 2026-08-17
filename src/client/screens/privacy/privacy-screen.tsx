import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell, GlassPanel } from "@/components/shell";
import { theme } from "@/lib/theme";

// Static privacy policy (#99). No cookie banner: the one cookie is
// better-auth's session cookie, which is strictly necessary and so exempt
// from consent (see #99 for the reasoning).

const CONTACT_EMAIL = "joss@bleach.digital";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className="text-sm font-semibold"
        style={{ color: theme.text.heading }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: theme.text.body }}>
      {children}
    </p>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul
      className="ml-4 flex list-disc flex-col gap-1.5 text-sm leading-relaxed"
      style={{ color: theme.text.body }}
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ContactLink() {
  return (
    <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );
}

// The footer link into the policy, shared by the two screens that offer it
// (sign-in and profile) so their wording and placement can't drift apart.
export function PrivacyPolicyLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 self-center text-xs underline"
      style={{ color: theme.text.faint }}
    >
      Privacy policy
    </button>
  );
}

export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  return (
    <AppShell showNav={false}>
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-white/50 ring-1 ring-inset ring-white/70 backdrop-blur-xl transition-transform active:scale-95"
      >
        <ArrowLeft
          className="h-4 w-4"
          style={{ color: theme.text.body }}
          strokeWidth={2.25}
        />
      </button>

      <h1
        className="font-display text-[1.75rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Privacy policy
      </h1>
      <p className="mt-2 text-xs" style={{ color: theme.text.faint }}>
        Last updated 17 August 2026.
      </p>

      <GlassPanel className="mt-6 flex flex-col gap-6">
        <Section title="Who controls your data">
          <Body>
            Joss runs Intake. Joss is an individual, not a company. Joss is the
            data controller. Write to <ContactLink /> with any question about
            this policy or about your data.
          </Body>
        </Section>

        <Section title="What data Intake holds">
          <List
            items={[
              "Your email address. You give this when you sign in with a one-time code.",
              "Your diet data. This is your calorie goal, your profile (weight and macro targets), your diary entries, and your saved meals.",
              "What you send to log a meal. This is the meal description you type, or the label photo you take.",
            ]}
          />
          <Body>
            Intake ties this data to your account. No other user can read it.
          </Body>
          <Body>
            Intake keeps only the food and the amounts it works out from a
            description or a photo. It does not keep the photo, and it does not
            keep the text you typed.
          </Body>
        </Section>

        <Section title="Why Intake can use it">
          <List
            items={[
              "To give you the service you asked for. The legal basis is contract.",
              "To keep you signed in. The legal basis is legitimate interest. The app cannot work without a sign-in cookie.",
            ]}
          />
        </Section>

        <Section title="Cookies and storage">
          <Body>
            Intake sets one cookie. It also keeps a small amount of data in your
            browser. All of it is there to make the app work.
          </Body>
          <List
            items={[
              "Session cookie. better-auth sets it. It keeps you signed in. It is strictly necessary, so Intake does not ask for your consent to it.",
              "sessionStorage. Holds your sign-in step and the email you typed, so you do not lose a code after you reload the tab.",
              "localStorage. Holds the ID of the last account to sign in on this device. This clears the cached data when a different account signs in.",
              "IndexedDB. Holds a copy of the diet data you recently looked at, such as your diary and your goals, for up to 24 hours. This lets the app show it when you are offline.",
            ]}
          />
          <Body>
            None of this follows you across other websites. There is nothing
            here to accept or to reject, so Intake shows no cookie banner.
          </Body>
        </Section>

        <Section title="No tracking">
          <Body>
            Intake has no analytics, no advertising, and no third-party tracking
            scripts.
          </Body>
        </Section>

        <Section title="Other services Intake uses">
          <Body>
            The Intake server sends some data to other services so that the app
            can work. Each one processes that data for Intake only. None of
            them set a cookie in your browser.
          </Body>
          <List
            items={[
              "Resend sends your sign-in code to your email address.",
              "OpenRouter runs the AI models that read your meal descriptions and your label photos, and gives back the food and the nutrition.",
              "Open Food Facts answers a question about a food by name or barcode, when that food is not already in the Intake database. Intake sends no account data with the question.",
              "Sentry receives error reports from the Intake server. Joss uses these reports to find and fix faults.",
            ]}
          />
        </Section>

        <Section title="How long Intake keeps your data">
          <Body>
            Your data stays while your account exists. Intake has no
            delete-my-account button yet. To delete your account and all of its
            data, write to <ContactLink />.
          </Body>
        </Section>

        <Section title="Your rights">
          <Body>Under the GDPR you can ask to:</Body>
          <List
            items={[
              "get a copy of your data (access)",
              "correct data that is wrong (rectification)",
              "delete your data (erasure)",
              "receive your data in a portable file (portability)",
              "object to how Intake uses your data (objection)",
            ]}
          />
          <Body>
            To use any of these rights, write to <ContactLink />.
          </Body>
        </Section>
      </GlassPanel>
    </AppShell>
  );
}
