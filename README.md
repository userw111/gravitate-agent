# Gravitate Agent

A minimalist Next.js application with WorkOS AuthKit authentication, designed with a clean, ultra-thin aesthetic inspired by Steve Jobs' design philosophy.

## Features

- 🔐 **WorkOS AuthKit Integration** - Hosted sign-in with seamless authentication
- 🎨 **Minimalist Design** - Clean, elegant UI with smooth animations
- ⚡ **Next.js 15** - Built with the latest Next.js App Router
- ☁️ **Cloudflare Workers** - Configured for Cloudflare Workers deployment
- 🎯 **Type-Safe** - Full TypeScript support

## Prerequisites

- Node.js 18+ and pnpm (or npm/yarn)
- A [WorkOS](https://workos.com) account

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/userw111/gravitate-agent.git
cd gravitate-agent
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up WorkOS

1. Create an account at [WorkOS Dashboard](https://dashboard.workos.com)
2. Navigate to **Configuration** → **AuthKit** (or **User Management** → **Redirects**)
3. Copy your **API Key** and **Client ID**
4. **Important:** In **Redirect URIs**, add the exact callback URL:
   - For local development: `http://localhost:3000/api/auth/callback`
   - For production: `https://your-domain.com/api/auth/callback` (replace with your actual domain)
   
   ⚠️ **The redirect URI must match exactly** - including the protocol (`http://` or `https://`), domain, and path (`/api/auth/callback`). Make sure there are no trailing slashes.

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Update the values in `.env.local`:

```env
WORKOS_API_KEY=sk_your_api_key_here
WORKOS_CLIENT_ID=client_your_client_id_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 5. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
gravitate-agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/
│   │   │       ├── sign-in/      # Initiates WorkOS sign-in
│   │   │       ├── callback/     # Handles OAuth callback
│   │   │       └── sign-out/      # Handles sign-out
│   │   ├── dashboard/            # Protected dashboard page
│   │   ├── page.tsx              # Sign-in page
│   │   └── layout.tsx            # Root layout
│   ├── components/
│   │   ├── SignInButton.tsx      # Sign-in button component
│   │   └── SignOutButton.tsx     # Sign-out button component
│   └── lib/
│       └── auth.ts               # Authentication utilities
├── .env.example                  # Environment variables template
└── README.md
```

## Authentication Flow

1. User clicks "Sign In" on the homepage
2. Redirects to WorkOS hosted sign-in page
3. User authenticates via WorkOS
4. WorkOS redirects back to `/api/auth/callback`
5. Callback route validates the code and creates a session
6. User is redirected to `/dashboard`

## Deployment

### Cloudflare Workers

This project is configured for Cloudflare Workers deployment using OpenNext Cloudflare.

**Deploy to Cloudflare Workers:**

```bash
pnpm deploy
```

This will:
1. Build your Next.js application
2. Deploy it to Cloudflare Workers using Wrangler

**Configure Environment Variables:**

Set your environment variables using Wrangler:

```bash
# Set secrets (for sensitive data)
wrangler secret put WORKOS_API_KEY
wrangler secret put WORKOS_CLIENT_ID

# Set public environment variables
wrangler secret put NEXT_PUBLIC_APP_URL
```

Or configure them in `wrangler.jsonc` under the `vars` section for non-sensitive variables:

```jsonc
{
  "vars": {
    "NEXT_PUBLIC_APP_URL": "https://your-domain.workers.dev"
  }
}
```

**Preview Locally:**

```bash
pnpm preview
```

This builds and runs your application locally using Wrangler's dev server.

### Cloudflared Named Tunnel (stable public URL for local dev)

1. Install cloudflared:
   ```bash
   brew install cloudflared
   ```
2. Authenticate and create a tunnel:
   ```bash
   pnpm tunnel:login
   pnpm tunnel:create
   ```
   Note the printed TUNNEL_ID.
3. Route DNS to your subdomain:
   ```bash
   pnpm tunnel:dns
   ```
   Replace `dev.yourdomain.com` in `package.json` with your actual domain first.
4. Configure the tunnel:
   - Copy `cloudflared/config.yml.example` to `cloudflared/config.yml`
   - Fill in your `<TUNNEL_ID>`, `credentials-file` path, and `hostname`
5. Run the tunnel:
   ```bash
   pnpm tunnel:run
   ```
6. Update environment and WorkOS redirects:
   - `.env.local`:
     ```env
     NEXT_PUBLIC_APP_URL=https://dev.yourdomain.com
     ```
   - WorkOS Dashboard → Redirect URIs:
     - Login Redirect: `https://dev.yourdomain.com/api/auth/callback`
     - Logout Redirect (optional): `https://dev.yourdomain.com/`
7. Restart your dev server and test sign-in/sign-out at `https://dev.yourdomain.com`.

### Other Platforms

For other platforms (Vercel, Netlify, etc.), you'll need to adjust the build configuration. The current setup is optimized for Cloudflare Workers.

## Design Philosophy

This application follows minimalist design principles:
- **Simplicity** - Clean layouts with generous white space
- **Typography** - Light, readable fonts with careful tracking
- **Animations** - Subtle, fast transitions (150-300ms)
- **Focus** - Essential features only, no distractions

## Learn More

- [WorkOS AuthKit Documentation](https://workos.com/docs/user-management/authkit/introduction)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)

## License

MIT
