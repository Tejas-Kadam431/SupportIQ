import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { setCredentials } from "./authSlice";
import { useLoginMutation } from "./authApi";
import { loginFormSchema, type LoginFormInput } from "./schemas";

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormInput>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

async function onSubmit(values: LoginFormInput) {
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
  }
}

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Login to SupportIQ</h1>
      <p>Continue managing customer support tickets.</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: "1rem" }}>
          <label>Email</label>
          <input
            {...register("email")}
            type="email"
            style={{ display: "block", width: "100%", padding: "0.6rem" }}
          />
          {errors.email && <p style={{ color: "red" }}>{errors.email.message}</p>}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label>Password</label>
          <input
            {...register("password")}
            type="password"
            style={{ display: "block", width: "100%", padding: "0.6rem" }}
          />
          {errors.password && <p style={{ color: "red" }}>{errors.password.message}</p>}
        </div>

        {error && <p style={{ color: "red" }}>Invalid email or password</p>}

        <button disabled={isLoading} type="submit">
          {isLoading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p>
        New here? <Link to="/register">Create account</Link>
      </p>
    </main>
  );
}