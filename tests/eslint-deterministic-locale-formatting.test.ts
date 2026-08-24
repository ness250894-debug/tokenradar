import { Linter } from "eslint";
import type { Rule } from "eslint";
import { describe, expect, it } from "vitest";

import deterministicLocaleFormatting from "../eslint-rules/deterministic-locale-formatting.mjs";

const RULE_ID = "tokenradar/deterministic-locale-formatting";
const linter = new Linter({ configType: "flat" });

function lint(code: string) {
  const config: Linter.Config = {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      tokenradar: {
        rules: {
          "deterministic-locale-formatting": deterministicLocaleFormatting as Rule.RuleModule,
        },
      },
    },
    rules: {
      [RULE_ID]: "error",
    },
  };

  return linter.verify(
    code,
    config,
    { filename: "src/locale-probe.js" },
  );
}

function messageIds(code: string) {
  return lint(code)
    .filter((message) => message.ruleId === RULE_ID)
    .map((message) => message.messageId);
}

describe("deterministic locale formatting ESLint rule", () => {
  it("accepts static locales and explicit date timezones", () => {
    const messages = lint(`
      const LOCALE = "en-US";
      const LOCALES = ["en-US", "en"];
      const DATE_OPTIONS = { year: "numeric", timeZone: "UTC" };
      (1234).toLocaleString(LOCALE);
      "a".localeCompare("b", LOCALE);
      "title"["toLocaleUpperCase"](LOCALE);
      new Intl.NumberFormat(LOCALES).format(1234);
      Intl["Collator"](LOCALE).compare("a", "b");
      new Date(0).toLocaleDateString(LOCALE, DATE_OPTIONS);
      Date.prototype["toLocaleTimeString"].call(new Date(0), LOCALE, { timeZone: "UTC" });
      new Date(0)["toLocaleString"](LOCALE, { timeZone: "UTC" });
      new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC" }).format(new Date(0));
    `);

    expect(messages).toEqual([]);
  });

  it.each([
    ["direct method", `(1234).toLocaleString()`, ["missingLocale"]],
    ["computed method", `(1234)["toLocaleString"]()`, ["missingLocale"]],
    ["optional method", `(1234)?.toLocaleString()`, ["missingLocale"]],
    ["borrowed method", `Number.prototype.toLocaleString.call(1234)`, ["missingLocale"]],
    ["borrowed apply method", `Number.prototype.toLocaleString.apply(1234)`, ["unsupportedApply"]],
    ["default collation", `"a".localeCompare("b")`, ["missingLocale"]],
    ["computed collation", `"a"["localeCompare"]("b")`, ["missingLocale"]],
    ["Intl constructor", `new Intl.NumberFormat()`, ["missingLocale"]],
    ["computed Intl call", `Intl["ListFormat"]()`, ["missingLocale"]],
    ["dynamic method locale", `function format(locale) { return (1234).toLocaleString(locale); }`, ["dynamicLocale"]],
    ["dynamic Intl locale", `function format(locale) { return new Intl.NumberFormat(locale); }`, ["dynamicLocale"]],
  ])("requires a static locale for %s", (_label, code, expectedMessageIds) => {
    expect(messageIds(code)).toEqual(expectedMessageIds);
  });

  it.each([
    [
      "date method",
      `new Date(0).toLocaleDateString("en-US")`,
      ["missingTimeZone"],
    ],
    [
      "computed date method",
      `new Date(0)["toLocaleTimeString"]("en-US", {})`,
      ["missingTimeZone"],
    ],
    [
      "borrowed date method",
      `Date.prototype.toLocaleDateString.call(new Date(0), "en-US", {})`,
      ["missingTimeZone"],
    ],
    [
      "known Date toLocaleString receiver",
      `new Date(0).toLocaleString("en-US")`,
      ["missingTimeZone"],
    ],
    [
      "const Date receiver",
      `const date = new Date(0); date.toLocaleString("en-US")`,
      ["missingTimeZone"],
    ],
    [
      "date-shaped toLocaleString options",
      `formatValue.toLocaleString("en-US", { year: "numeric" })`,
      ["missingTimeZone"],
    ],
    [
      "DateTimeFormat constructor",
      `new Intl.DateTimeFormat("en-US", { year: "numeric" })`,
      ["missingTimeZone"],
    ],
    [
      "undefined timezone",
      `new Intl.DateTimeFormat("en-US", { timeZone: undefined })`,
      ["missingTimeZone"],
    ],
  ])("requires an explicit timezone for %s", (_label, code, expectedMessageIds) => {
    expect(messageIds(code)).toEqual(expectedMessageIds);
  });

  it("reports both missing inputs on an unconfigured date formatter", () => {
    expect(messageIds(`new Intl.DateTimeFormat()`)).toEqual([
      "missingLocale",
      "missingTimeZone",
    ]);
  });
});
