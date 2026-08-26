import ts from 'typescript';

export type StaticAssignmentBinding = {
  memberName?: string;
  operator: ts.SyntaxKind;
  target: ts.Identifier;
  value: ts.Expression;
};

const SUPPORTED_ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

export function collectStaticAssignmentBindings(
  node: ts.BinaryExpression,
): StaticAssignmentBinding[] {
  const operator = node.operatorToken.kind;
  if (!SUPPORTED_ASSIGNMENT_OPERATORS.has(operator)) return [];

  const target = unwrapParenthesized(node.left);
  if (ts.isIdentifier(target)) {
    return [{ operator, target, value: node.right }];
  }
  if (operator !== ts.SyntaxKind.EqualsToken) return [];
  if (ts.isObjectLiteralExpression(target)) {
    return collectObjectAssignmentBindings(target, node.right, operator);
  }
  if (
    ts.isArrayLiteralExpression(target) &&
    ts.isArrayLiteralExpression(node.right)
  ) {
    return collectArrayAssignmentBindings(target, node.right, operator);
  }
  return [];
}

function collectObjectAssignmentBindings(
  target: ts.ObjectLiteralExpression,
  value: ts.Expression,
  operator: ts.SyntaxKind,
): StaticAssignmentBinding[] {
  return target.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property)) {
      return [
        {
          memberName: property.name.text,
          operator,
          target: property.name,
          value,
        },
      ];
    }
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isIdentifier(property.initializer)
    ) {
      return [];
    }
    const memberName = staticPropertyName(property.name);
    return memberName
      ? [{ memberName, operator, target: property.initializer, value }]
      : [];
  });
}

function collectArrayAssignmentBindings(
  target: ts.ArrayLiteralExpression,
  value: ts.ArrayLiteralExpression,
  operator: ts.SyntaxKind,
): StaticAssignmentBinding[] {
  return target.elements.flatMap((element, index) => {
    const assignedTarget = unwrapParenthesized(element);
    const assignedValue = value.elements[index];
    return ts.isIdentifier(assignedTarget) &&
      assignedValue !== undefined &&
      !ts.isOmittedExpression(assignedValue) &&
      !ts.isSpreadElement(assignedValue)
      ? [{ operator, target: assignedTarget, value: assignedValue }]
      : [];
  });
}

function unwrapParenthesized(expression: ts.Expression): ts.Expression {
  let candidate = expression;
  while (ts.isParenthesizedExpression(candidate)) {
    candidate = candidate.expression;
  }
  return candidate;
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) ||
      ts.isNoSubstitutionTemplateLiteral(name.expression))
    ? name.expression.text
    : undefined;
}
