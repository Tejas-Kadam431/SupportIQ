import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { setCredentials } from "./authSlice";
import { useRegisterMutation } from "./authApi";
import { registerFormSchema, type RegisterFormInput } from "./schemas";

export function RegisterPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [registerUser, { isLoading, error }] = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    }
  });

async function onSubmit(values: RegisterFormInput) {
  try {
    const response = await registerUser(values).unwrap();

    dispatch(
      setCredentials({
        user: response.data.user,
        accessToken: response.data.accessToken
      })
    );

    navigate("/dashboard");
  } catch (error) {
    console.error("Registration failed:", error);
  }
}

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Create SupportIQ account</h1>
      <p>Start building your support workspace.</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ marginBottom: "1rem" }}>
          <label>Name</label>
          <input
            {...register("name")}
            type="text"
            style={{ display: "block", width: "100%", padding: "0.6rem" }}
          />
          {errors.name && <p style={{ color: "red" }}>{errors.name.message}</p>}
        </div>

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

        {error && <p style={{ color: "red" }}>Registration failed</p>}

        <button disabled={isLoading} type="submit">
          {isLoading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </main>
  );
}