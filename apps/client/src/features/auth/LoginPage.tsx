import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { setCredentials } from "./authSlice";
import { useLoginMutation } from "./authApi";
import { loginFormSchema, type LoginFormInput } from "./schemas";
import "./auth.css";

const DEMO_CREDENTIALS: LoginFormInput = {
  email: "demo.owner@supportiq.app",
  password: "password123"
};

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<LoginFormInput>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  async function completeLogin(values: LoginFormInput) {
    setFormError(null);

    try {
      const response = await login(values).unwrap();

      dispatch(
        setCredentials({
          user: response.data.user,
          accessToken: response.data.accessToken
        })
      );

      navigate("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);
      setFormError("Invalid email or password. Please try again.");
    }
  }

  async function onSubmit(values: LoginFormInput) {
    await completeLogin(values);
  }

  async function handleDemoLogin() {
    setValue("email", DEMO_CREDENTIALS.email);
    setValue("password", DEMO_CREDENTIALS.password);

    await completeLogin(DEMO_CREDENTIALS);
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand">
          <span className="auth-logo">S</span>
          <span>SupportIQ</span>
        </div>

        <div className="auth-hero-content">
          <p className="auth-eyebrow">AI-powered customer support SaaS</p>
          <h1>Resolve support tickets faster with AI-assisted workflows.</h1>
          <p>
            Manage organizations, tickets, internal notes, knowledge base
            documents, activity timelines, and AI-generated support replies from
            one clean workspace.
          </p>
        </div>

        <div className="auth-feature-grid">
          <div>
            <strong>Multi-tenant support desk</strong>
            <span>Organizations, members, tickets, and RBAC.</span>
          </div>
          <div>
            <strong>Knowledge base search</strong>
            <span>Upload docs and search extracted support knowledge.</span>
          </div>
          <div>
            <strong>AI draft replies</strong>
            <span>Generate customer-ready replies from ticket context.</span>
          </div>
        </div>
      </section>

      <section className="auth-card" aria-label="Login form">
        <div className="auth-card-header">
          <h2>Welcome back</h2>
          <p>Login to continue managing customer support tickets.</p>
        </div>

        <button
          className="auth-demo-button"
          type="button"
          onClick={handleDemoLogin}
          disabled={isLoading}
        >
          {isLoading ? "Opening demo..." : "Try Demo Account"}
        </button>

        <div className="auth-divider">
          <span>or login manually</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              {...register("email")}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
            {errors.email && (
              <p className="auth-error">{errors.email.message}</p>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              {...register("password")}
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="auth-error">{errors.password.message}</p>
            )}
          </div>

          {(error || formError) && (
            <p className="auth-error auth-error-box">
              {formError ?? "Invalid email or password. Please try again."}
            </p>
          )}

          <button className="auth-submit-button" disabled={isLoading} type="submit">
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="auth-footer-text">
          New here? <Link to="/register">Create account</Link>
        </p>

        <p className="auth-demo-note">
          Recruiters can use the demo account to explore a pre-filled SupportIQ
          workspace instantly.
        </p>
      </section>
    </main>
  );
}