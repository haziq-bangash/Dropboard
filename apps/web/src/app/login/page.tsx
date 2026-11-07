import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in | Dropboard", robots: { index: false } };

export default function Login() {
  return (
    <main>
      <AuthForm />
    </main>
  );
}
