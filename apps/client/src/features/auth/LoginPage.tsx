import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { setCredentials } from "./authSlice";
import { useLoginMutation } from "./authApi";
import { loginFormSchema, type LoginFormInput } from "./schemas";
import { AuthShell } from "./AuthShell";
import { authErrorMessage } from "./authErrorMessage";

const DEMO_CREDENTIALS: LoginFormInput = {
  email: "demo.owner@supportiq.app",
  password: "password123"
};

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [activeAction, setActiveAction] = useState<"demo" | "login">("login");
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
      setFormError(authErrorMessage(error, "login"));
    }
  }

  async function onSubmit(values: LoginFormInput) {
    setActiveAction("login");
    await completeLogin(values);
  }

  async function handleDemoLogin() {
    setActiveAction("demo");
    setValue("email", DEMO_CREDENTIALS.email);
    setValue("password", DEMO_CREDENTIALS.password);

    await completeLogin(DEMO_CREDENTIALS);
  }

  return (
    <AuthShell>
        <div className="auth-card-header">
          <p className="auth-card-kicker">YOUR SUPPORT WORKSPACE</p>
          <h2>Welcome back</h2>
          <p>Sign in to pick up where your team left off.</p>
        </div>

        <button
          className="auth-demo-button"
          type="button"
          onClick={handleDemoLogin}
          disabled={isLoading}
        >
          {isLoading && activeAction === "demo" ? "Opening demo…" : "Try Demo Account"}
        </button>

        <div className="auth-divider">
          <span>or login manually</span>
        </div>

        <form className="auth-form" aria-label="Login form" aria-busy={isLoading} onSubmit={handleSubmit(onSubmit)}>
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
            <div className="auth-password"><input
              id="password"
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
            /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
            {errors.password && (
              <p className="auth-error">{errors.password.message}</p>
            )}
          </div>

          {formError && (
            <p className="auth-error auth-error-box" role="alert">
              {formError}
            </p>
          )}

          <button className="auth-submit-button" disabled={isLoading} type="submit">
            {isLoading && activeAction === "login" ? "Signing in…" : "Login"}
          </button>
        {isLoading && <p className="auth-field-hint" role="status">Connecting securely. This may take a moment.</p>}
        </form>

        <p className="auth-footer-text">
          New here? <Link to="/register">Create account</Link>
        </p>

        <p className="auth-demo-note">
          Recruiters can use the demo account to explore a pre-filled SupportIQ
          workspace instantly.
        </p>
      </AuthShell>
  );
}
