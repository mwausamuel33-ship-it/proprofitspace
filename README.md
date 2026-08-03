# ProProfitSpace

AI-powered trading workspace for Deriv traders. Advanced signal analysis, live market scanning, intelligent recovery system, and a premium trading experience.

## Features

- **AI Signal Center** — Advanced statistical analysis of synthetic index digits with entropy, volatility, momentum, and clustering detection
- **Live Market Scanner** — Continuously ranks all Volatility and Jump indices by opportunity strength
- **Smart Recovery** — Intelligent post-trade analysis that can continue, modify, reverse, or cancel further trades
- **Entry Scanner** — Advanced filtering for high-confidence opportunities with configurable thresholds
- **AI Market Assistant** — Chat interface for market analysis, signal explanations, and trading guidance
- **Premium Dashboard** — Real-time stats, quick actions, and AI recommendations
- **Smart Signal Cards** — Detailed signal information with confidence, trade score, risk level, and AI explanations
- **Digit Analytics** — Live digit distribution, heatmaps, streaks, hot/cold digits, and entropy graphs
- **Notification System** — Real-time alerts for signals, scanner updates, and market changes
- **Bot Builder** — Visual Blockly-based strategy builder with quick strategies
- **Trading Bots** — Premium bot showcase with one-click loading

## Tech Stack

- **React 18** with TypeScript
- **Rsbuild** for bundling
- **MobX** for state management
- **React Router** for navigation
- **SCSS** with CSS custom properties
- **SmartCharts** for TradingView-style charts
- **Blockly** for visual bot building
- **Deriv WebSocket API** for real-time data

## Prerequisites

- Node.js 20 or later

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The app is available at `http://localhost:4003` during development.

## Environment Variables

Create a `.env` file with:

```env
NEXT_PUBLIC_DERIV_APP_ID=your_app_id
NEXT_PUBLIC_DERIV_ENV=production
NEXT_PUBLIC_DERIV_REFERRAL_LINK=your_referral_link
```

## Branding

Brand configuration is in `brand.config.json`. Run `npm run generate:brand-css` to apply changes.

## Project Structure

```
src/
├── app/                    # App shell, routing, providers
├── components/             # Reusable UI components
│   ├── ai-assistant/       # AI chat assistant
│   ├── market-analysis/    # Signal cards, digit circles, gauges
│   ├── notifications/      # Real-time notification system
│   └── shared_ui/          # UI primitives
├── constants/              # App constants and config
├── hooks/                  # Custom React hooks
├── pages/                  # Page components
│   ├── dashboard/          # Premium dashboard
│   ├── analysis-tool/      # AI Signal Center
│   ├── signal-scanner/     # Live Market Scanner
│   ├── entry-scanner/      # Advanced entry filtering
│   └── ...
├── stores/                 # MobX state management
├── styles/                 # Global styles and themes
└── utils/                  # Utilities
    ├── signal-engine.ts    # Core AI signal computation
    ├── digit-stats.ts      # Digit analysis utilities
    └── ...
```

## License

ProProfitSpace — AI Trading Workspace
