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
| Snap a receipt | **Snap receipt** on Home or Expenses: take or pick a photo and the app fills in the store, date, total and a category guess for you to check. Text is read on the device with Tesseract.js, and the first use needs internet to download it. |
| Set a budget for each category, per month | **Budgets** tab (budgets carry over to the next month until you change them) |
| Track how much budget is left in each category | **Dashboard** and **Budgets** (progress bars, plus an "on pace to overspend" warning) |
| Savings goals | **Goals** tab: set a target and an optional date, then add or take out money. It shows progress, how much to save each month, and when you'll reach the goal at your current pace. Deposits can also be logged in your Savings category. Reaching a goal earns +5 stars and a celebration. |
| Share & inspire | **Share** buttons on Summary, Rewards, the quick-add menu, each expense and the goal-reached pop-up. They open a studio for a swipeable **progress carousel** (budget, savings and goals, rewards, plans, and an invitation to budget together) or an **expense photo** with a card showing category and budget status. Images are made on the device in 4 styles, with amounts hidden by default. Share them through the phone's share menu or save them, with a ready-made caption and hashtags. Your first share unlocks the **Inspirer** badge. |
| Rewards | **Rewards** tab, where you earn stars for good habits: +1 for each category kept within budget, +3 for a perfect month, +2 for saving 20%, +1 for paying all bills on time, and +1 for every 7 days in a row of logging. Stars raise your level and unlock badges, and new ones trigger a celebration with confetti. |
| Budget alerts | A red pop-up when an expense brings a category to 80% or more of its budget, a red banner listing those categories, and a once-a-day "Budget check" pop-up when you open the app |
| Monthly summary and tips for next month | **Summary** tab: category breakdown, 50/30/20 check, personalized tips, suggested budgets you can apply in one click |
| Bill due dates | **Bills** tab: monthly or one-time bills, overdue/due-soon alerts, "Mark paid" (logs the expense automatically) |

**Light / dark mode:** tap the sun/moon button at the top of any screen, or choose Light, Dark or Auto (follow the device) in Settings.

**Settings** lets you manage categories (Need / Want / Saving), change the currency (just the symbol, or convert every amount using an exchange rate you type in or fetch for today), export and import JSON backups, or load demo data.

## Files
- `index.html`: layout
- `styles.css`: styling (supports light and dark mode, works on mobile)
- `app.js`: all the app logic
