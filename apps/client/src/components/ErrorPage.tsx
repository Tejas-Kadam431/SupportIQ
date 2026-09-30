import { Link } from "react-router-dom";

export function ErrorPage() {


  console.warn("SupportIQ operation failed; see the on-screen recovery message.");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "system-ui"
      }}
    >
      <section
        style={{
          maxWidth: 520,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: "2rem",
          background: "white"
        }}
      >
        <h1>Something went wrong</h1>
        <p>
          The page crashed while loading. Please go back to the dashboard and try
          again.
        </p>

        <Link to="/dashboard">Go to dashboard</Link>
      </section>
    </main>
  );
}