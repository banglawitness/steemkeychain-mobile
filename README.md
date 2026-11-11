# Steem Keychain

Mobile wallet for the Steem blockchain. It holds posting, active, and memo keys, signs transfers and governance actions, and lets Steem sites talk to the wallet from the in-app browser.

The owner key is never stored.

## Layout

```
App.tsx                 app shell, theme, lock
index.js                Expo entry
src/screens             wallet, send, history, browser, settings, governance
src/components          shared UI: drawer, confirm sheet, logos, PIN pad
src/navigation          stack routes
src/auth                PIN, biometric unlock, active account
src/steem               Steem RPC, balances, history, prices, governance
src/browser             dApp bridge and signed requests
src/storage             PIN vault, notices, saved recipients, security
src/crypto              account export and QR pages
src/theme.tsx           dark and light palettes
```

## Run

```bash
npm install
npx expo start
```

Open the project in Expo Go (SDK 58). Chain calls use the `steem` package and `https://api.steemit.com`, plus any custom node saved in Settings.

## Privacy

The privacy policy is `docs/index.html`. After GitHub Pages is enabled for the `/docs` folder, its address is:

`https://USERNAME.github.io/REPOSITORY/`

Replace `your-email@gmail.com` in that file before you submit the link to Google Play.
