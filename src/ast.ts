import { ASTNodeType } from "./common";

export abstract class ASTNode {
  type: ASTNodeType;
  constructor(type: ASTNodeType) {
    this.type = type;
  }
  visit(): void {
    // check for interrupt
  }
}
export class Program extends ASTNode {
  body: ASTNode[];
  constructor(body: ASTNode[]) {
    super(ASTNodeType.PROG);
    this.body = body;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class Raw extends ASTNode {
  value: string;
  constructor(value: string) {
    super(ASTNodeType.RAW);
    this.value = value;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
/**
 * \foobar[...]{...}...
 * Not a built-in function
 */
export class FunctionCall extends ASTNode {
  name: string;
  params: Params;
  args: ASTNode[];
  constructor(name: string, params?: Params, args?: ASTNode[]) {
    super(ASTNodeType.F_CALL);
    this.name = name;
    this.params = params ?? new Params({});
    this.args = args ?? [];
  }

  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
/**
 * \fn[x,y]{add}{\${x + y}}
 * x und y sind automatisch verfügbar in JS eval
 */
export class FunctionDefinition extends ASTNode {
  name: ASTNode;
  // arguments [x,y]  only key is relevant  maybe later use =string =int for type checking
  fnArgs: Params;
  body: ASTNode;
  constructor(name: ASTNode, fnArgs: Params, body: ASTNode) {
    super(ASTNodeType.F_DEF);
    this.name = name;
    this.fnArgs = fnArgs;
    this.body = body;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
/**
 * [a=b,c=d,...] and [arg1,arg2,..]
 */
export class Params extends ASTNode {
  kv: { [key: string]: ASTNode | null };
  constructor(kv: { [key: string]: ASTNode | null }) {
    super(ASTNodeType.PARAMS);
    this.kv = kv;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class IfStatement extends ASTNode {
  condition: ASTNode;
  trueBranch: ASTNode;
  falseBranch: ASTNode;
  constructor(condition: ASTNode, trueBranch: ASTNode, falseBranch: ASTNode) {
    super(ASTNodeType._IF);
    this.condition = condition;
    this.trueBranch = trueBranch;
    this.falseBranch = falseBranch;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class LoopStatement extends ASTNode {
  init: ASTNode;
  condition: ASTNode;
  increment: ASTNode;
  body: ASTNode;
  constructor(init: ASTNode, condition: ASTNode, increment: ASTNode, body: ASTNode) {
    super(ASTNodeType._LOOP);
    this.init = init;
    this.condition = condition;
    this.increment = increment;
    this.body = body;
  }
}
export class URLStatement extends ASTNode {
  url: ASTNode;
  constructor(url: ASTNode) {
    super(ASTNodeType._URL);
    this.url = url;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class FileStatement extends ASTNode {
  path: ASTNode;
  constructor(path: ASTNode) {
    super(ASTNodeType._FILE);
    this.path = path;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class UseStatement extends ASTNode {
  code: ASTNode;
  constructor(code: ASTNode) {
    super(ASTNodeType._USE);
    this.code = code;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class EvalExpr extends ASTNode {
  expr: string;
  constructor(expr: string) {
    super(ASTNodeType.EVAL);
    this.expr = expr;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
export class Comment extends ASTNode {
  value: string;
  constructor(value: string) {
    super(ASTNodeType.COMMENT);
    this.value = value;
  }
  visit(): void {
    super.visit();
    throw new Error("Method not implemented.");
  }
}
