# Office Invoices Admin Web

React/Vite administrator interface for the existing Office Invoices Express API.

## Run locally

Start the backend first:

```powershell
cd "..\invoice_back end"
node server.js
```

Then start this application:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173/` in a browser. The API defaults to `http://localhost:3000`; set `VITE_API_URL` when the backend is hosted elsewhere.

Only accounts with the backend role `admin` can enter the panel. The panel uses the existing `/login`, invoice, user, and report endpoints and stores only the returned JWT and non-sensitive user identity in browser local storage.

## Production build

```powershell
npm run build
npm run preview
```
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
