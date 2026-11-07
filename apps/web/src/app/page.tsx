import { Uploader } from "@/components/Uploader";

export default function Home() {
  return (
    <main>
      <header className="hero">
        <h1>Turn any spreadsheet into a dashboard</h1>
        <p>Drop an Excel, CSV or JSON file. Get KPIs and charts in seconds, with no signup and no upload.</p>
      </header>
      <Uploader />
    </main>
  );
}
