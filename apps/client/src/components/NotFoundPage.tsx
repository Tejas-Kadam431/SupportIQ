import { Link } from "react-router-dom";

export function NotFoundPage() {
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
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist.</p>

        <Link to="/dashboard">Go to dashboard</Link>
      </section>
    </main>
  );
}