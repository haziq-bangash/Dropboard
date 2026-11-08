import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { ASSISTANT, CONTACT_EMAIL, OPERATOR } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of use | Dropboard",
  description: "The rules for using Dropboard, in plain words.",
};

export default function Terms() {
  return (
    <LegalPage
      title="Terms of use"
      intro="These are the rules for using Dropboard. By creating an account or using the service you agree to them. If you do not agree, please do not use it."
    >
      <LegalSection title="The service">
        <p>
          Dropboard, run by {OPERATOR}, turns a spreadsheet into a dashboard in your browser, lets you save dashboards, share a read-only
          snapshot by link, and ask {ASSISTANT}, an AI assistant, about the shape of your data. It is still being built: features change,
          and some may be removed.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Give us a real email address and keep your sign-in details to yourself. You are responsible for what happens under your account,
          so tell us if you think someone else has got in. You must be at least 16 years old.
        </p>
      </LegalSection>

      <LegalSection title="Plans and limits">
        <p>
          The free plan currently allows 3 saved projects, 3 published links and 10 {ASSISTANT} requests a day. We may change these limits,
          and we may offer paid plans later. We will not charge you for anything without asking you first.
        </p>
      </LegalSection>

      <LegalSection title="Your data">
        <p>
          Your data stays yours. Your spreadsheet&apos;s rows are read in your browser and are not uploaded; the{" "}
          <Link href="/privacy">privacy page</Link> explains what we do keep. You give us only the permission we need to run the service for
          you: to store your projects and to show your published links to the people you gave them to.
        </p>
        <p>
          You promise that you have the right to use the data you bring, and that publishing it does not break the law or anyone&apos;s
          rights. You are responsible for what you publish. Anyone with a published link can see what is in it.
        </p>
      </LegalSection>

      <LegalSection title="What not to do">
        <ul>
          <li>Do not use Dropboard for anything illegal, or to harm, harass or deceive anyone.</li>
          <li>Do not publish content that is unlawful, that infringes someone&apos;s rights, or that is meant to mislead people, such as phishing.</li>
          <li>Do not try to break, overload or get around the service, its limits or its security, and do not probe it for weaknesses without asking us first.</li>
          <li>Do not use automated means to create accounts or to make requests at a scale a person would not.</li>
          <li>Do not resell the service or pass it off as your own.</li>
        </ul>
        <p>
          If you break these rules, we may remove a published link, limit your use or close your account. Where we can, we will tell you why.
        </p>
      </LegalSection>

      <LegalSection title={`${ASSISTANT} and what it says`}>
        <p>
          {ASSISTANT} is an AI. It can be wrong, and the charts, findings and stories it helps produce describe patterns in your data; they do
          not explain why something happened. Check anything important before you rely on it. Nothing in Dropboard is financial, legal, medical
          or other professional advice.
        </p>
      </LegalSection>

      <LegalSection title="The code and the name">
        <p>
          The source code of Dropboard is published on GitHub under the PolyForm Noncommercial License 1.0.0. You may read, run and change it for
          noncommercial purposes, such as learning, research or personal projects. You may not use it commercially, for example to offer a
          competing product or service, without a separate licence from us. The text is in the LICENSE file in the repository. To ask about a
          commercial licence, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>The Dropboard name and logo are ours. Using the service does not give you any right to them.</p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          We work to keep Dropboard running, but we do not promise it will always be available or free of mistakes. We may change, suspend or
          stop any part of it. You can stop using it and delete your account at any time from the Account page.
        </p>
      </LegalSection>

      <LegalSection title="Our responsibility">
        <p>
          Dropboard is provided as it is. As far as the law allows, we are not responsible for losses that come from using it or not being able
          to, such as lost profits or decisions made on its output. Nothing here limits responsibility that cannot be limited by law, for
          example for intent, for gross negligence, or for injury to life, body or health.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. The date at the top shows the latest version, and for changes that matter we will tell signed-in users. If
          you keep using Dropboard after a change, you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
