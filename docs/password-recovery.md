# Password Recovery Flow

This document explains how the Supabase-based password recovery flow works across the API REST service and the frontend application.

## API REST

### Environment

Add the following environment variable to the API REST service:

- `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`: URL that Supabase will use when sending the recovery link. This should point to the frontend reset password route, for example `https://your-domain/reset-password`.

Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already configured.

### Endpoints

- `POST /auth/password/recovery`: accepts `{ "email": "user@example.com" }` and triggers Supabase to send the recovery email. The endpoint always responds with `202 Accepted` to avoid leaking whether an email exists.
- `POST /auth/password/reset`: accepts `{ "accessToken": "...", "password": "newPassword" }`. It validates the recovery token with Supabase and, if valid, updates the user password.

Both routes are public (no authentication required) and include structured logging through `nestjs-pino`.

## Frontend

- `/forgot-password`: form that collects the email and calls `POST /auth/password/recovery`.
- `/reset-password`: page that reads Supabase’s `access_token` and `type=recovery` from the query string and sends them with the new password to `POST /auth/password/reset`.

The reset form enforces an 8 character minimum and asks for password confirmation before sending the request. On success it informs the user and links back to the login page.

## Supabase Settings

In the Supabase dashboard, set the **Site URL** (or recovery redirect) to the same value used in `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`. Supabase will append the recovery parameters (such as `access_token` and `type=recovery`) to this URL when sending the email.
