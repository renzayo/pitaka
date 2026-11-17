# Pitaka — Personal Finance App

A simple personal finance tracker that runs in your browser. It has no dependencies and needs no account. Your data is stored in your browser's localStorage.

## Run it

```bash
python -m http.server 5173
```

Then open http://localhost:5173. Opening `index.html` directly also works in most browsers.

## Use it on your phone

1. **Try it on the same Wi-Fi.** Run the server on your PC and open `http://<your-PC-IP>:5173` on your phone. Use **Share → Add to Home Screen** on iPhone or **⋮ → Add to Home screen** on Android. This only works while the PC is on, and it won't work offline.
2. **Install it as a real app.** Put the files on any HTTPS host, such as GitHub Pages or Netlify. Open that link on your phone, then install it as in step 1. It then opens full-screen and works offline.

Data is saved on each device separately. To move data between devices, use **Settings → Export / Import**.

## Features

| Feature | Where |
|---|---|
| Log income (with sources) | **Income** tab |
| Log expenses by category | **Expenses** tab (each new expense shows how much budget is left in its category) |
| Set a budget for each category, per month | **Budgets** tab (budgets carry over to the next month until you change them) |
| Track how much budget is left in each category | **Dashboard** and **Budgets** (progress bars, plus an "on pace to overspend" warning) |
| Monthly summary and tips for next month | **Summary** tab: category breakdown, 50/30/20 check, personalized tips, suggested budgets you can apply in one click |
| Bill due dates | **Bills** tab: monthly or one-time bills, overdue/due-soon alerts, "Mark paid" (logs the expense automatically) |

**Settings** lets you manage categories (Need / Want / Saving), change the currency, export and import JSON backups, or load demo data.

## Files
- `index.html`: layout
- `styles.css`: styling (supports light and dark mode, works on mobile)
- `app.js`: all the app logic
