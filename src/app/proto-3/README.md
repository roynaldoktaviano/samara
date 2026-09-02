# Samara Marketing Operations Mockup

A functional React/Vite mockup for a role-based marketing operations module designed to match the existing Samara ERP interface.

## Run

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Main interactions

- Switch between **Owner / Director**, **Marketing Director**, and **Marketing Team** in the top-right role selector.
- Open the **Otium · Raja Ampat 2027** campaign for the detailed workflow.
- Move between campaign brief, components, content approval, publishing, and performance tabs.
- Open the **Landing Page** component to use the controlled landing-page builder.
- Open an organic-social publishing packet for the phone handoff workflow.
- Use **New campaign** to walk through the four-step campaign builder.
- Use the left navigation to explore audiences, automations, publishing, performance, and other logical modules.

## Implementation notes

- `App.jsx` is self-contained and only imports React.
- Styling is embedded in the component so it can replace an existing Vite `App.jsx` directly.
- Demo imagery is loaded from Unsplash and can later be replaced with the ERP asset library.
- Metrics and integrations are realistic sample data for product-design purposes; API connections are not included in this mockup.
