import { authRoutes } from "./routes/auth";

const server = Bun.serve({
  async fetch(req) {
    return new Response('Hello, World!');
  },
  routes: {
    ...authRoutes
  },
  development: process.env.NODE_ENV !== 'production',
  port: 3000
});

console.log(`🚀 Server running at ${server.url}`);
