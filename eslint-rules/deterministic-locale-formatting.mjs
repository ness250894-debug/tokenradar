const LOCALE_METHOD_ARGUMENT_INDEX = new Map([
  ["toLocaleString", 0],
  ["toLocaleDateString", 0],
  ["toLocaleTimeString", 0],
  ["toLocaleLowerCase", 0],
  ["toLocaleUpperCase", 0],
  ["localeCompare", 1],
]);

const DATE_METHODS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

const DATE_OPTION_NAMES = new Set([
  "dateStyle",
  "day",
  "dayPeriod",
  "era",
  "fractionalSecondDigits",
  "hour",
  "hour12",
  "hourCycle",
  "minute",
  "month",
  "second",
  "timeStyle",
  "timeZoneName",
  "weekday",
  "year",
]);

const INTL_FORMATTERS = new Set([
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
]);

const EXPRESSION_WRAPPERS = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

function unwrapExpression(node) {
  let current = node;
  while (current && EXPRESSION_WRAPPERS.has(current.type)) current = current.expression;
  return current;
}

function getStaticPropertyName(memberExpression) {
  const member = unwrapExpression(memberExpression);
  if (!member || member.type !== "MemberExpression") return null;

  const property = unwrapExpression(member.property);
  if (!member.computed && property?.type === "Identifier") return property.name;
  if (member.computed && property?.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  if (
    member.computed &&
    property?.type === "TemplateLiteral" &&
    property.expressions.length === 0
  ) {
    return property.quasis[0]?.value.cooked ?? property.quasis[0]?.value.raw ?? null;
  }
  return null;
}

function getConstInitializer(identifier, sourceCode, seenVariables) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      if (seenVariables.has(variable)) return null;
      const definition = variable.defs.find(
        (candidate) =>
          candidate.type === "Variable" &&
          candidate.parent?.kind === "const" &&
          candidate.node?.init,
      );
      if (!definition) return null;
      seenVariables.add(variable);
      return definition.node.init;
    }
    scope = scope.upper;
  }
  return null;
}

function resolveConstExpression(node, sourceCode, seenVariables = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression || expression.type !== "Identifier" || expression.name === "undefined") {
    return expression;
  }
  const initializer = getConstInitializer(expression, sourceCode, seenVariables);
  return initializer
    ? resolveConstExpression(initializer, sourceCode, seenVariables)
    : expression;
}

function isStaticLocale(node, sourceCode, seenVariables = new Set()) {
  const expression = resolveConstExpression(node, sourceCode, seenVariables);
  if (!expression) return false;

  if (expression.type === "Literal") {
    return typeof expression.value === "string" && expression.value.trim().length > 0;
  }
  if (expression.type === "TemplateLiteral") {
    if (expression.expressions.length > 0) return false;
    const value = expression.quasis[0]?.value.cooked ?? expression.quasis[0]?.value.raw ?? "";
    return value.trim().length > 0;
  }
  if (expression.type === "ArrayExpression") {
    return (
      expression.elements.length > 0 &&
      expression.elements.every(
        (element) =>
          element &&
          element.type !== "SpreadElement" &&
          isStaticLocale(element, sourceCode, new Set(seenVariables)),
      )
    );
  }
  return false;
}

function isUndefinedLike(node) {
  const expression = unwrapExpression(node);
  return (
    !expression ||
    (expression.type === "Identifier" && expression.name === "undefined") ||
    (expression.type === "Literal" && expression.value === null) ||
    expression.type === "UnaryExpression" && expression.operator === "void"
  );
}

function hasExplicitTimeZone(node, sourceCode, seenVariables = new Set()) {
  const expression = resolveConstExpression(node, sourceCode, seenVariables);
  if (!expression || expression.type !== "ObjectExpression") return false;

  return expression.properties.some((property) => {
    if (property.type === "SpreadElement") {
      return hasExplicitTimeZone(property.argument, sourceCode, new Set(seenVariables));
    }
    return (
      property.type === "Property" &&
      getStaticPropertyName({
        type: "MemberExpression",
        object: expression,
        property: property.key,
        computed: property.computed,
      }) === "timeZone" &&
      !isUndefinedLike(property.value)
    );
  });
}

function hasDateFormattingOption(node, sourceCode, seenVariables = new Set()) {
  const expression = resolveConstExpression(node, sourceCode, seenVariables);
  if (!expression || expression.type !== "ObjectExpression") return false;

  return expression.properties.some((property) => {
    if (property.type === "SpreadElement") {
      return hasDateFormattingOption(property.argument, sourceCode, new Set(seenVariables));
    }
    if (property.type !== "Property") return false;
    const propertyName = getStaticPropertyName({
      type: "MemberExpression",
      object: expression,
      property: property.key,
      computed: property.computed,
    });
    return DATE_OPTION_NAMES.has(propertyName);
  });
}

function isDateReceiver(node, sourceCode) {
  const receiver = resolveConstExpression(node, sourceCode);
  if (
    receiver?.type === "NewExpression" &&
    unwrapExpression(receiver.callee)?.type === "Identifier" &&
    unwrapExpression(receiver.callee).name === "Date"
  ) {
    return true;
  }
  return (
    receiver?.type === "MemberExpression" &&
    getStaticPropertyName(receiver) === "prototype" &&
    unwrapExpression(receiver.object)?.type === "Identifier" &&
    unwrapExpression(receiver.object).name === "Date"
  );
}

function getLocaleMethodInvocation(callExpression) {
  const callee = unwrapExpression(callExpression.callee);
  if (!callee || callee.type !== "MemberExpression") return null;

  let methodMember = callee;
  let argumentOffset = 0;
  const invocationHelper = getStaticPropertyName(callee);
  if (invocationHelper === "call" || invocationHelper === "apply") {
    const borrowedMember = unwrapExpression(callee.object);
    if (!borrowedMember || borrowedMember.type !== "MemberExpression") return null;
    methodMember = borrowedMember;
    argumentOffset = 1;
  }

  const methodName = getStaticPropertyName(methodMember);
  const localeArgumentIndex = LOCALE_METHOD_ARGUMENT_INDEX.get(methodName);
  if (localeArgumentIndex === undefined) return null;

  return {
    argumentOffset,
    localeArgumentIndex: localeArgumentIndex + argumentOffset,
    methodMember,
    methodName,
    unsupportedApply: invocationHelper === "apply",
  };
}

function getIntlFormatterName(node) {
  const callee = unwrapExpression(node.callee);
  if (!callee || callee.type !== "MemberExpression") return null;
  const object = unwrapExpression(callee.object);
  if (object?.type !== "Identifier" || object.name !== "Intl") return null;
  const formatterName = getStaticPropertyName(callee);
  return INTL_FORMATTERS.has(formatterName) ? formatterName : null;
}

function validateLocale(context, node, localeArgument) {
  if (!localeArgument) {
    context.report({ node, messageId: "missingLocale" });
  } else if (!isStaticLocale(localeArgument, context.sourceCode)) {
    context.report({ node: localeArgument, messageId: "dynamicLocale" });
  }
}

function validateTimeZone(context, node, optionsArgument) {
  if (!hasExplicitTimeZone(optionsArgument, context.sourceCode)) {
    context.report({ node, messageId: "missingTimeZone" });
  }
}

const deterministicLocaleFormatting = {
  meta: {
    type: "problem",
    docs: {
      description: "Require deterministic locale and timezone inputs for locale-sensitive formatting",
    },
    schema: [],
    messages: {
      missingLocale: "Pass a static explicit locale so formatting is deterministic across runtimes.",
      dynamicLocale: "Use a literal locale or a const initialized from literal locale values.",
      missingTimeZone: "Pass an options object with an explicit timeZone for date formatting.",
      unsupportedApply: "Avoid borrowed locale methods via .apply(); use a direct call with explicit locale and timezone inputs.",
    },
  },
  create(context) {
    function inspectLocaleMethod(node) {
      const invocation = getLocaleMethodInvocation(node);
      if (!invocation) return;

      if (invocation.unsupportedApply) {
        context.report({ node, messageId: "unsupportedApply" });
        return;
      }

      validateLocale(context, node, node.arguments[invocation.localeArgumentIndex]);
      const optionsArgument = node.arguments[invocation.argumentOffset + 1];
      const requiresTimeZone =
        DATE_METHODS.has(invocation.methodName) ||
        (invocation.methodName === "toLocaleString" &&
          (isDateReceiver(invocation.methodMember.object, context.sourceCode) ||
            hasDateFormattingOption(optionsArgument, context.sourceCode)));
      if (requiresTimeZone) {
        validateTimeZone(context, node, optionsArgument);
      }
    }

    function inspectIntlFormatter(node) {
      const formatterName = getIntlFormatterName(node);
      if (!formatterName) return;
      validateLocale(context, node, node.arguments[0]);
      if (formatterName === "DateTimeFormat") {
        validateTimeZone(context, node, node.arguments[1]);
      }
    }

    return {
      CallExpression(node) {
        inspectLocaleMethod(node);
        inspectIntlFormatter(node);
      },
      NewExpression: inspectIntlFormatter,
    };
  },
};

export default deterministicLocaleFormatting;
