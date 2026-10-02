import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../app/hooks';
import { setCredentials } from './authSlice';
import { useRegisterMutation } from './authApi';
import { registerFormSchema, type RegisterFormInput } from './schemas';
import { AuthShell } from './AuthShell';
import { authErrorMessage } from './authErrorMessage';

export function RegisterPage() {
  const navigate = useNavigate(), dispatch = useAppDispatch();
  const [registerUser, { isLoading }] = useRegisterMutation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema), defaultValues: { name: '', email: '', password: '' }
  });
  async function onSubmit(values: RegisterFormInput) {
    setFormError(null);
    try {
      const response = await registerUser(values).unwrap();
      dispatch(setCredentials({ user: response.data.user, accessToken: response.data.accessToken }));
      navigate('/dashboard');
    } catch (error) { setFormError(authErrorMessage(error, 'register')); }
  }
  return <AuthShell>
    <div className="auth-card-header"><p className="auth-card-kicker">YOUR SUPPORT WORKSPACE</p><h2>Create your account</h2><p>Start with your own workspace. Invite your team when you’re ready.</p></div>
    <form className="auth-form" onSubmit={handleSubmit(onSubmit)} aria-label="Registration form" aria-busy={isLoading}>
      <div className="auth-field"><label htmlFor="register-name">Name</label><input id="register-name" autoComplete="name" placeholder="Your full name" {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined}/>{errors.name && <p id="name-error" className="auth-error">{errors.name.message}</p>}</div>
      <div className="auth-field"><label htmlFor="register-email">Email</label><input id="register-email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined}/>{errors.email && <p id="email-error" className="auth-error">{errors.email.message}</p>}</div>
      <div className="auth-field"><label htmlFor="register-password">Password</label><div className="auth-password"><input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" {...register('password')} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : 'password-hint'}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div><p className="auth-field-hint" id="password-hint">Use at least 8 characters.</p>{errors.password && <p id="password-error" className="auth-error">{errors.password.message}</p>}</div>
      {formError && <p className="auth-error auth-error-box" role="alert">{formError}</p>}
      <button className="auth-submit-button" disabled={isLoading} type="submit">{isLoading ? 'Creating account…' : 'Create account'}</button>
      {isLoading && <p className="auth-field-hint" role="status">Connecting securely. This may take a moment.</p>}
    </form>
    <p className="auth-footer-text">Already have an account? <Link to="/login">Sign in</Link></p>
    <p className="auth-demo-note">Just looking around? <Link to="/login">Explore the read-only demo</Link> without creating an account.</p>
  </AuthShell>;
}
