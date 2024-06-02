import { ASTNodeType, Indexable } from "./common";
import { Visitor } from "./visitor";

export abstract class ASTNode implements Indexable {
  type: ASTNodeType;
  row: number;
  col: number;
  fileName?: string; /* used for imports */
  constructor(type: ASTNodeType, row: number, col: number) {
    this.type = type;
    this.row = row;
    this.col = col;
  }
  abstract accept<T>(visitor: Visitor<T>): T; // check for interrupt
}
export class Program extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitProgram(this);
  }
  body: ASTNode[];
  constructor(body: ASTNode[], row: number, col: number) {
    super(ASTNodeType.PROG, row, col);
    this.body = body;
  }
}
export class RawStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitRaw(this);
  }
  value: string;
  constructor(value: string, row: number, col: number) {
    super(ASTNodeType.RAW, row, col);
    this.value = value;
  }
}
/**
 * \foobar[...]{...}...
 * Not a built-in function
 */
export class FunctionCall extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitFunctionCall(this);
  }
  name: string;
  params: Params;
  args: ASTNode[];
  constructor(name: string, params: Params | null, args: ASTNode[], row: number, col: number) {
    super(ASTNodeType.F_CALL, row, col);
    this.name = name;
    this.params = params ?? new Params({}, row, col);
    this.args = args ?? [];
  }
}
/**
 * \fn[x,y]{add}{\${x + y}}
 * x und y sind automatisch verfügbar in JS eval
 */
export class FunctionDefinition extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitFunctionDefinition(this);
  }
  name: ASTNode;
  // arguments [x,y]  only key is relevant  maybe later use =string =int for type checking
  fnArgs: Params;
  body: ASTNode;
  constructor(name: ASTNode, fnArgs: Params, body: ASTNode, row: number, col: number) {
    super(ASTNodeType.F_DEF, row, col);
    this.name = name;
    this.fnArgs = fnArgs;
    this.body = body;
  }
}
/**
 * [a=b,c=d,...] and [arg1,arg2,..]
 */
export class Params extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitParams(this);
  }
  kv: { [key: string]: ASTNode | null };
  constructor(kv: { [key: string]: ASTNode | null }, row: number, col: number) {
    super(ASTNodeType.PARAMS, row, col);
    this.kv = kv;
  }
}
export class IfStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitIfStatement(this);
  }
  condition: ASTNode;
  trueBranch: ASTNode;
  falseBranch: ASTNode | undefined;
  constructor(condition: ASTNode, trueBranch: ASTNode, falseBranch: ASTNode, row: number, col: number) {
    super(ASTNodeType._IF, row, col);
    this.condition = condition;
    this.trueBranch = trueBranch;
    this.falseBranch = falseBranch;
  }
}
export class MatchStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitMatchStatement(this);
  }
  value: ASTNode;
  cases: CaseStatement[]; // eval from first to last
  // defaultCase: ASTNode; // nicht nötig einfach \case{true}{...}
  constructor(value: ASTNode, cases: CaseStatement[], row: number, col: number) {
    super(ASTNodeType._MATCH, row, col);
    this.value = value;
    this.cases = cases;
  }
}
export class CaseStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitCaseStatement(this);
  }
  value: ASTNode;
  body: ASTNode;
  constructor(value: ASTNode, body: ASTNode, row: number, col: number) {
    super(ASTNodeType._CASE, row, col);
    this.value = value;
    this.body = body;
  }
}

export class LoopStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitLoopStatement(this);
  }
  init: ASTNode;
  condition: ASTNode;
  increment: ASTNode;
  body: ASTNode;
  constructor(init: ASTNode, condition: ASTNode, increment: ASTNode, body: ASTNode, row: number, col: number) {
    super(ASTNodeType._LOOP, row, col);
    this.init = init;
    this.condition = condition;
    this.increment = increment;
    this.body = body;
  }
}
export class ExecStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitExecStatement(this);
  }
  command: ASTNode;
  constructor(command: ASTNode, row: number, col: number) {
    super(ASTNodeType._EXEC, row, col);
    this.command = command;
  }
}
export class URLStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitURLStatement(this);
  }
  url: ASTNode;
  constructor(url: ASTNode, row: number, col: number) {
    super(ASTNodeType._URL, row, col);
    this.url = url;
  }
}
export class FileStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitFileStatement(this);
  }
  path: ASTNode;
  constructor(path: ASTNode, row: number, col: number) {
    super(ASTNodeType._FILE, row, col);
    this.path = path;
  }
}
export class UseStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitUseStatement(this);
  }
  code: ASTNode;
  params: Params | undefined;
  hash: ASTNode | undefined;
  constructor(code: ASTNode, params: Params | undefined = undefined, hash: ASTNode | undefined, row: number, col: number) {
    super(ASTNodeType._USE, row, col);
    this.code = code;
    this.params = params;
    this.hash = hash;
  }
}
export class EvalStatement extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitEvalStatement(this);
  }
  expr: string;
  constructor(expr: string, row: number, col: number) {
    super(ASTNodeType.EVAL, row, col);
    this.expr = expr;
  }
}
export class Comment extends ASTNode {
  accept<T>(visitor: Visitor<T>): T {
    return visitor.visitComment(this);
  }
  value: string;
  constructor(value: string, row: number, col: number) {
    super(ASTNodeType.COMMENT, row, col);
    this.value = value;
  }
}

// export function converter<I extends ASTNode, O extends ASTNode>(inputAST: I, inputASTNodeType: ASTNodeType, outputFactory: (input: I) => O): O {
//   if (inputAST.type === inputASTNodeType) return inputAST as unknown as O;
//   return new outputClass(inputAST.row, inputAST.col);
// }
export function convertRawToEval(input: RawStatement | EvalStatement): EvalStatement {
  if (input.type === ASTNodeType.EVAL) return input as EvalStatement;
  return new EvalStatement((input as RawStatement).value, input.row, input.col);
}
export function convertEvalToRaw(input: EvalStatement): RawStatement {
  return new RawStatement(input.expr, input.row, input.col);
}
