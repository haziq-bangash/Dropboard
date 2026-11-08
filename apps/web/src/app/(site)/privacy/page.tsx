import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { ASSISTANT, CONTACT_EMAIL, OPERATOR } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy | Dropboard",
  description: "What Dropboard keeps, what stays in your browser, and what is sent to others.",
};

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro="The short version: the rows of your spreadsheet stay in your browser. We keep your account and the dashboards you save, and nothing else about your data."
    >
      <LegalSection title="Who is responsible">
        <p>
          Dropboard is run by {OPERATOR}. For anything in this page, or to ask about your data, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="What stays on your device">
        <p>
          When you drop in a file, it is read and analysed in your browser. Its rows are never uploaded to our servers, not when you
          build a dashboard, not when you save a project, and not when you ask {ASSISTANT} a question.
        </p>
        <p>
          So that a saved project opens without asking for the file again, your browser can keep a copy of the table in its private
          storage, on this device only. It is kept per signed-in account and removed when you sign out.
        </p>
      </LegalSection>

      <LegalSection title="What we keep on our servers">
        <ul>
          <li>
            <strong>Your account:</strong> your name and email address, and either a hash of your password (never the password itself) or a
            link to your Google account if you sign in with Google.
          </li>
          <li>
            <strong>Your plan:</strong> if you pay for a plan, which plan, its status and when the current period ends, with the customer and
            subscription numbers Stripe gives us. We never see or keep your card details; Stripe does.
          </li>
          <li>
            <strong>Your sign-ins:</strong> for each session, when it started and ends, the network address it came from and the browser
            it used, so that we can protect your account and show you where you are signed in.
          </li>
          <li>
            <strong>Your projects:</strong> the name, the file name, how many rows the file had, and the dashboard itself: its charts,
            their titles and the queries behind them. Not the rows.
          </li>
          <li>
            <strong>Links you publish:</strong> a snapshot of the numbers each chart showed at that moment, at most 1,000 rows per chart,
            and an optional password (as a hash). Anyone who has the link can see the snapshot, so publish only what you are happy to
            share. Charts that could show a single record, such as maps, box plots and flow diagrams, leave out groups with fewer than five
            rows. You can revoke a link at any time.
          </li>
          <li>
            <strong>{ASSISTANT} usage:</strong> when you used it, what kind of request it was, which model answered and how many tokens
            it took, to enforce the daily limit and to run the service. We also keep the dashboards {ASSISTANT} generated, filed under a
            fingerprint of the column names, so the same request is not answered twice.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title={`What ${ASSISTANT} is sent`}>
        <p>{ASSISTANT} is an AI assistant. To answer, it is sent:</p>
        <ul>
          <li>the names and types of your columns, and counts of how many values are empty or different;</li>
          <li>what you typed to it: your instruction or your question;</li>
          <li>
            if a query failed, the database&apos;s error message, with any value in quotes removed first, so that it can suggest a fix;
          </li>
          <li>
            if you ask it to write your Story, the numbers behind each finding (shares, changes, correlations). Names, dates and individual
            values are replaced by placeholders before sending and put back in your browser afterwards.
          </li>
        </ul>
        <p>
          It is never sent your rows, and never your email address or name. The text is processed by our AI provider, currently OpenAI, to
          produce the answer.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We use one cookie to keep you signed in, and a short-lived one while you sign in with Google. Your browser&apos;s local storage holds small settings, such as that you closed the
          welcome guide. We do not use advertising, tracking or analytics cookies, and we do not run analytics on this site.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles your data">
        <p>We use a few services to run Dropboard. Each handles only what its job needs:</p>
        <ul>
          <li>
            <strong>Google Cloud</strong>, to host the site and the service, in Frankfurt (Germany).
          </li>
          <li>
            <strong>A managed PostgreSQL database service</strong>, to store the account and project data described above.
          </li>
          <li>
            <strong>OpenAI</strong>, to run {ASSISTANT}, for the text described above.
          </li>
          <li>
            <strong>Resend</strong>, to send the emails you ask for: confirming your address and resetting your password.
          </li>
          <li>
            <strong>Stripe</strong>, if you pay for a plan, to take payment, send receipts and handle tax.
          </li>
          <li>
            <strong>Google</strong>, if you choose to sign in with Google. Google tells us your name and email address.
          </li>
        </ul>
        <p>
          Some of these are outside the European Economic Area. Where that applies, they rely on safeguards such as the European
          Commission&apos;s standard contractual clauses. We do not sell your data and we do not share it for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Why we may use it, and for how long">
        <p>
          We use your data to provide the service you asked for, to keep it secure and to prevent abuse, and, where the law asks for it, with
          your consent. We keep your account and projects until you delete them. A session stops working when it expires or when you sign out. When you delete a
          project, its published links go with it. When you delete your account, your profile, sessions, projects, published links and{" "}
          {ASSISTANT} usage are removed too.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask us for a copy of your data, to correct it, to delete it, to limit how we use it or to move it, and you can object to
          how we use it. You can delete your projects and your account yourself from the Account page. For anything else, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you think we have handled your data wrongly, you can complain to your
          data protection authority.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Dropboard is not meant for anyone under 16, and we do not knowingly collect data from them.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change this page in a way that matters, we will change the date at the top and, for big changes, tell signed-in users. The{" "}
          <Link href="/terms">terms of use</Link> are a separate page.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
