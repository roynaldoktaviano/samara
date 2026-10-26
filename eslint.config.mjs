import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // Design-system guardrails (warn while modules are being migrated)
    "no-restricted-globals": ["warn",
      { name: "confirm", message: "Use useConfirm() from @/components/ui/confirm-dialog." },
      { name: "alert", message: "Use toast from 'sonner' instead of alert()." },
      { name: "prompt", message: "Use usePrompt() from @/components/ui/confirm-dialog." },
    ],
    "no-restricted-properties": ["warn",
      { object: "window", property: "confirm", message: "Use useConfirm() from @/components/ui/confirm-dialog." },
      { object: "window", property: "alert", message: "Use toast from 'sonner' instead of alert()." },
      { object: "window", property: "prompt", message: "Use usePrompt() from @/components/ui/confirm-dialog." },
    ],
    "no-restricted-syntax": ["warn",
      { selector: "Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]", message: "Hardcoded hex colour in a class — use a design token (bg-primary, text-muted-foreground, …)." },
      { selector: "TemplateElement[value.raw=/-\\[#[0-9a-fA-F]{3,8}\\]/]", message: "Hardcoded hex colour in a class — use a design token (bg-primary, text-muted-foreground, …)." },
    ],

    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
